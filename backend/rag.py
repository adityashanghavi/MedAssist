"""
rag.py — Retrieval-Augmented Generation module for MedAssist

Uses ChromaDB's built-in ONNX embedding function (no extra libraries needed).
ChromaDB already includes onnxruntime as a dependency, so this works
on Render's free tier without PyTorch or Rust compilation.
"""

import requests
import time
import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
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

_collection = None
_is_ready = False
_embed_fn = None


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
    global _collection, _is_ready, _embed_fn

    logger.info("RAG: Initialising embedding function (ChromaDB built-in ONNX)...")
    _embed_fn = ONNXMiniLM_L6_V2()

    logger.info("RAG: Initialising ChromaDB...")
    client = chromadb.Client(Settings(anonymized_telemetry=False))
    _collection = client.create_collection(
        name="medical_literature",
        embedding_function=_embed_fn,
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

    logger.info(f"RAG: Embedding and storing {len(d_docs)} abstracts...")
    batch = 50
    for i in range(0, len(d_docs), batch):
        _collection.add(
            documents=d_docs[i:i+batch],
            ids=d_ids[i:i+batch],
            metadatas=d_meta[i:i+batch],
        )

    _is_ready = True
    logger.info(f"RAG: Ready — {len(d_docs)} abstracts indexed.")


def retrieve(query: str) -> str:
    if not _is_ready or _collection is None:
        return ""
    try:
        results = _collection.query(
            query_texts=[query],
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
