from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import anthropic
import os
import io
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="MedAssist API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """You are MedAssist, a knowledgeable medical information assistant. You provide clear, accurate, and helpful medical information to users.

Guidelines:
- Provide evidence-based medical information clearly and compassionately
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


@app.get("/")
def root():
    return {"status": "MedAssist API is running"}


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Accept a PDF file and return its extracted text."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported on this endpoint.")

    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(status_code=500, detail="pdfplumber is not installed. Run: pip install pdfplumber")

    try:
        contents = await file.read()
        text_pages = []
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_pages.append(page_text)

        if not text_pages:
            raise HTTPException(status_code=422, detail="Could not extract any text from this PDF. It may be a scanned image.")

        full_text = "\n\n".join(text_pages)
        # Limit to ~50,000 characters to stay within token limits
        if len(full_text) > 50000:
            full_text = full_text[:50000] + "\n\n[Document truncated due to length]"

        return {"text": full_text, "pages": len(text_pages)}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse PDF: {str(e)}")


@app.post("/chat")
def chat(request: ChatRequest):
    if not request.messages:
        raise HTTPException(status_code=400, detail="No messages provided")

    # Build system prompt — inject document text if provided
    system = SYSTEM_PROMPT
    if request.document_text:
        system += f"\n\n---\nThe user has uploaded a document. Use it to answer their questions:\n\n{request.document_text}\n---"

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=system,
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
        )
        return {"reply": response.content[0].text}

    except anthropic.AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid API key")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
