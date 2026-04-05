from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import anthropic
import os
import io
import logging
import threading
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MedAssist API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are MedAssist, a knowledgeable medical information assistant powered by evidence-based medical literature.

Guidelines:
- Provide evidence-based medical information clearly and compassionately
- When relevant PubMed literature is provided to you, use it to ground your answer and mention it came from published research
- Always remind users to consult a licensed healthcare professional for personal medical advice, diagnoses, or treatment decisions
- Explain medical terms in plain language
- For emergencies, always direct users to call 911 or go to the nearest emergency room immediately
- Be empathetic and understanding — health questions can be stressful
- Structure longer answers with clear sections when helpful
- Never diagnose conditions or prescribe treatments

If a document has been uploaded, use it as the primary reference when answering questions.
You are informative, calm, professional, and warm."""


class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    document_text: Optional[str] = None


# ── RAG: build index in background on startup ──────────────────────────────────

def _build_rag_in_background():
    try:
        from rag import build_index
        build_index()
    except Exception as e:
        logger.warning(f"RAG build failed: {e}. Continuing without RAG.")

@app.on_event("startup")
async def startup_event():
    logger.info("Server starting — building RAG index in background...")
    thread = threading.Thread(target=_build_rag_in_background, daemon=True)
    thread.start()


# ── Helper: OCR a PDF using Tesseract ─────────────────────────────────────────

def _ocr_pdf(pdf_bytes: bytes) -> tuple:
    """Convert scanned PDF pages to images and run OCR on each page."""
    try:
        import pytesseract
        import shutil
        from pdf2image import convert_from_bytes

        # Find tesseract wherever it is installed
        tesseract_path = shutil.which("tesseract")
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
            logger.info(f"Found tesseract at: {tesseract_path}")
        else:
            # Try common Nix paths
            for path in [
                "/nix/var/nix/profiles/default/bin/tesseract",
                "/run/current-system/sw/bin/tesseract",
                "/usr/bin/tesseract",
                "/usr/local/bin/tesseract",
            ]:
                if os.path.exists(path):
                    pytesseract.pytesseract.tesseract_cmd = path
                    logger.info(f"Found tesseract at fallback path: {path}")
                    break

        images = convert_from_bytes(pdf_bytes, dpi=200)
        text_pages = []
        for image in images:
            page_text = pytesseract.image_to_string(image)
            if page_text.strip():
                text_pages.append(page_text.strip())
        return text_pages, len(images)
    except Exception as e:
        import traceback
        logger.error(f"OCR failed: {str(e)}")
        logger.error(traceback.format_exc())
        raise RuntimeError(f"OCR failed: {str(e)}")


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    try:
        from rag import _is_ready
        rag_status = "ready" if _is_ready else "building"
    except Exception:
        rag_status = "unavailable"
    return {"status": "MedAssist API is running", "rag": rag_status}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename.lower()

    if filename.endswith(".txt"):
        contents = await file.read()
        text = contents.decode("utf-8", errors="ignore")
        return {"text": text, "pages": 1}

    if filename.endswith(".pdf"):
        contents = await file.read()

        # First try pdfplumber (works for text-based PDFs)
        try:
            import pdfplumber
            text_pages = []
            with pdfplumber.open(io.BytesIO(contents)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text and page_text.strip():
                        text_pages.append(page_text)

            if text_pages:
                full_text = "\n\n".join(text_pages)
                if len(full_text) > 50000:
                    full_text = full_text[:50000] + "\n\n[Document truncated due to length]"
                return {"text": full_text, "pages": len(text_pages)}
        except Exception as e:
            logger.warning(f"pdfplumber failed, trying OCR: {e}")

        # Fall back to OCR for scanned PDFs
        try:
            logger.info("Attempting OCR on scanned PDF...")
            text_pages, num_pages = _ocr_pdf(contents)
            if text_pages:
                full_text = "\n\n".join(text_pages)
                if len(full_text) > 50000:
                    full_text = full_text[:50000] + "\n\n[Document truncated due to length]"
                return {"text": full_text, "pages": num_pages}
            else:
                raise HTTPException(status_code=422, detail="Could not extract text from this PDF. The document may be unreadable.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

    raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported.")


@app.post("/chat")
def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    system = SYSTEM_PROMPT

    if request.document_text:
        system += f"\n\n---\nThe user has uploaded a document. Use it to answer their questions:\n\n{request.document_text}\n---"

    try:
        from rag import retrieve, _is_ready
        if _is_ready:
            last_user_msg = next(
                (m.content for m in reversed(request.messages) if m.role == "user"),
                ""
            )
            rag_context = retrieve(last_user_msg)
            if rag_context:
                system += f"\n\n---\n{rag_context}\n---"
                logger.info("RAG context injected into prompt.")
    except Exception as e:
        logger.warning(f"RAG skipped: {e}")

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            temperature=0.3,
            system=system,
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
        )
        return {"reply": response.content[0].text}

    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid API key")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
