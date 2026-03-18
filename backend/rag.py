"""
rag.py — Retrieval-Augmented Generation module for MedAssist

On server startup this module:
1. Fetches ~200 abstracts from PubMed across 8 medical topics
2. Embeds them using fastembed (lightweight, no PyTorch required)
3. Stores them in an in-memory ChromaDB vector database

On each chat query:
4. Embeds the user's question
5. Retrieves the top 5 most relevant abstracts
6. Returns them as context to inject into Claude's system prompt
"""

import requests
import time
import chromadb
from chromadb.config import Settings
from fastembed import TextEmbedding
import logging
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

TOPICS = [
    "diabetes mellitus treatment",
    "hypertension management",
    "infectious disease antibiotic",
    "cancer oncology therapy",
    "mental health depression anxiety",
    "cardiovascular disease heart failure",
    "respiratory disease asthma COPD",
    "pharmacology drug interactions",
]

ABSTRACTS_PER_TOPIC = 25
TOP_K_RESULTS = 5
PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

_model = None
_collection = None
_is_ready = False


def _search_pubmed_ids(query: str, max_results: int) -> list:
    try:
        resp = requests.get(
            f"{PUBMED_BASE}/esearch.fcgi",
            params={"db": "pubmed", "term": query, "retmax": max_results,
                    "retmode": "json", "sort": "relevance"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["esearchresult"]["idlist"]
    except Exception as e:
        logger.warning(f"PubMed search failed for '{query}': {e}")
        return []


def _fetch_abstracts(ids: list) -> list:
    if not ids:
        return []
    try:
        resp = requests.get(
            f"{PUBMED_BASE}/efetch.fcgi",
            params={"db": "pubmed", "id": ",".join(ids),
                    "rettype": "abstract", "retmode": "xml"},
            timeout=30,
        )
        resp.raise_for_status()
        return _parse_xml_abstracts(resp.text)
    except Exception as e:
        logger.warning(f"PubMed fetch failed: {e}")
        return []


def _parse_xml_abstracts(xml_text: str) -> list:
    results = []
    try:
        root = ET.fromstring(xml_text)
        for article in root.findall(".//PubmedArticle"):
            pmid_el     = article.find(".//PMID")
            title_el    = article.find(".//ArticleTitle")
            abstract_el = article.find(".//AbstractText")
            pmid     = pmid_el.text     if pmid_el     is not None else "unknown"
            title    = title_el.text    if title_el    is not None else ""
            abstract = abstract_el.text if abstract_el is not None else ""
            if abstract and len(abstract) > 100:
                results.append({
                    "pmid": pmid,
                    "title": title or "Untitled",
                    "text": f"{title}\n\n{abstract}",
                })
    except Exception as e:
        logger.warning(f"XML parse error: {e}")
    return results


def build_index():
    global _model, _collection, _is_ready

    logger.info("RAG: Loading embedding model (BAAI/bge-small-en-v1.5 via fastembed)...")
    _model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

    logger.info("RAG: Initialising ChromaDB...")
    client = chromadb.Client(Settings(anonymized_telemetry=False))
    _collection = client.create_collection(
        name="medical_literature",
        metadata={"hnsw:space": "cosine"},
    )

    all_docs, all_ids, all_meta = [], [], []

    logger.info(f"RAG: Fetching PubMed abstracts for {len(TOPICS)} topics...")
    for topic in TOPICS:
        logger.info(f"  -> {topic}")
        ids       = _search_pubmed_ids(topic, ABSTRACTS_PER_TOPIC)
        abstracts = _fetch_abstracts(ids)
        for doc in abstracts:
            all_docs.append(doc["text"])
            all_ids.append(doc["pmid"])
            all_meta.append({"title": doc["title"], "pmid": doc["pmid"]})
        time.sleep(0.4)

    if not all_docs:
        logger.warning("RAG: No abstracts fetched — RAG disabled.")
        return

    # Deduplicate by PMID
    seen = set()
    d_docs, d_ids, d_meta = [], [], []
    for doc, uid, meta in zip(all_docs, all_ids, all_meta):
        if uid not in seen:
            seen.add(uid)
            d_docs.append(doc)
            d_ids.append(uid)
            d_meta.append(meta)

    logger.info(f"RAG: Embedding {len(d_docs)} abstracts...")
    embeddings = list(_model.embed(d_docs))

    logger.info("RAG: Storing in ChromaDB...")
    batch = 100
    for i in range(0, len(d_docs), batch):
        _collection.add(
            documents=d_docs[i:i+batch],
            embeddings=[e.tolist() for e in embeddings[i:i+batch]],
            ids=d_ids[i:i+batch],
            metadatas=d_meta[i:i+batch],
        )

    _is_ready = True
    logger.info(f"RAG: Ready — {len(d_docs)} abstracts indexed.")


def retrieve(query: str) -> str:
    if not _is_ready or _collection is None or _model is None:
        return ""
    try:
        query_embedding = list(_model.embed([query]))[0].tolist()
        results = _collection.query(
            query_embeddings=[query_embedding],
            n_results=TOP_K_RESULTS,
            include=["documents", "metadatas"],
        )
        docs  = results["documents"][0]
        metas = results["metadatas"][0]
        if not docs:
            return ""
        lines = ["Relevant medical literature from PubMed:\n"]
        for i, (doc, meta) in enumerate(zip(docs, metas), 1):
            lines.append(f"[{i}] PMID {meta.get('pmid','?')}\n{doc}\n")
        return "\n".join(lines)
    except Exception as e:
        logger.warning(f"RAG retrieval error: {e}")
        return ""
