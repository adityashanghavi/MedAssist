import { useState, useRef, useEffect } from "react";

const API_URL = "https://medassist-backend-n0e0.onrender.com";

const suggestedQuestions = [
  "What are common symptoms of Type 2 diabetes?",
  "How does high blood pressure affect the body?",
  "What's the difference between viral and bacterial infections?",
  "When should I see a doctor for chest pain?",
];

const PulseIcon = () => (
  <div style={{
    width: "44px", height: "44px", borderRadius: "12px",
    background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.25)",
    fontFamily: "Georgia, serif", fontWeight: "bold",
    fontSize: "16px", color: "white", letterSpacing: "1px",
  }}>AS</div>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <line x1="22" y1="2" x2="11" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2" stroke="currentColor" strokeWidth="2" fill="currentColor" strokeLinejoin="round"/>
  </svg>
);

const UploadIcon = () => (
  <span style={{ fontSize: "22px", lineHeight: 1, fontWeight: "300" }}>+</span>
);

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: "7px", height: "7px", borderRadius: "50%", background: "#00b8a9",
          animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s`
        }} />
      ))}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: "16px", animation: "fadeSlideIn 0.3s ease forwards",
      gap: "10px", alignItems: "flex-end"
    }}>
      {!isUser && (
        <div style={{
          width: "34px", height: "34px", borderRadius: "50%",
          background: "linear-gradient(135deg, #00b8a9, #0077b6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontSize: "15px"
        }}>🩺</div>
      )}
      <div style={{
        maxWidth: "72%",
        background: isUser ? "linear-gradient(135deg, #0077b6, #00b8a9)" : "white",
        color: isUser ? "white" : "#1a2332",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "12px 16px", fontSize: "14px", lineHeight: "1.65",
        boxShadow: isUser ? "0 4px 16px rgba(0,119,182,0.3)" : "0 2px 12px rgba(0,0,0,0.08)",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
        border: isUser ? "none" : "1px solid rgba(0,184,169,0.12)"
      }}>
        {msg.content}
      </div>
      {isUser && (
        <div style={{
          width: "34px", height: "34px", borderRadius: "50%", background: "#e8f4f8",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, fontSize: "15px"
        }}>👤</div>
      )}
    </div>
  );
}

function DocumentBadge({ fileName, onRemove }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      background: "rgba(0,184,169,0.08)", border: "1px solid rgba(0,184,169,0.3)",
      borderRadius: "10px", padding: "8px 12px", margin: "0 16px 10px",
      fontFamily: "sans-serif"
    }}>
      <span style={{ fontSize: "16px" }}>📄</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", fontWeight: "bold", color: "#0077b6",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {fileName}
        </div>
        <div style={{ fontSize: "11px", color: "#5a8fa3" }}>
          Loaded — ask any questions about this document
        </div>
      </div>
      <button onClick={onRemove} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#888", fontSize: "16px", padding: "0 2px",
        lineHeight: 1, flexShrink: 0
      }} title="Remove document">✕</button>
    </div>
  );
}

export default function MedicalChatbot() {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hello! I'm MedAssist, your medical information companion created by Aditya Shanghavi. I can help answer general health questions, explain medical terms, or discuss symptoms and conditions.\n\nYou can also upload a PDF or TXT file and ask questions about it.\n\nHow can I help you today? Remember, for emergencies always call 911."
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [documentText, setDocumentText] = useState(null);
  const [documentName, setDocumentName] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-uploaded

    const isTxt = file.name.toLowerCase().endsWith(".txt");
    const isPdf = file.name.toLowerCase().endsWith(".pdf");

    if (!isTxt && !isPdf) {
      setError("Only PDF and TXT files are supported.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      if (isTxt) {
        // Read TXT directly in the browser
        const text = await file.text();
        setDocumentText(text);
        setDocumentName(file.name);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `📄 I've loaded "${file.name}". Ask me anything about it!`
        }]);
      } else {
        // Send PDF to backend for parsing
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${API_URL}/upload`, {
          method: "POST",
          body: formData
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || "Failed to parse PDF");
        }
        const data = await res.json();
        setDocumentText(data.text);
        setDocumentName(file.name);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `📄 I've loaded "${file.name}" (${data.pages} page${data.pages !== 1 ? "s" : ""}). Ask me anything about it!`
        }]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = () => {
    setDocumentText(null);
    setDocumentName(null);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "Document removed. I'm back to general medical questions — how can I help?"
    }]);
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput("");
    setError(null);

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          document_text: documentText || null
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Server error");
      }

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err.message);
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      background: "linear-gradient(160deg, #e8f6f8 0%, #f0f9ff 50%, #e8f4f0 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", fontFamily: "'Georgia', serif"
    }}>
      <style>{`
        body, #root { margin: 0; padding: 0; width: 100%; min-height: 100vh; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-6px);opacity:1} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
        textarea:focus{outline:none}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:rgba(0,184,169,.3);border-radius:10px}
        .suggest:hover{background:rgba(0,184,169,.12)!important;border-color:#00b8a9!important}
        .send:hover:not(:disabled){background:#0077b6!important;transform:scale(1.05)}
        .send:disabled{opacity:.5;cursor:not-allowed}
        .upload-btn:hover{background:rgba(0,184,169,0.15)!important;}
      `}</style>

      <div style={{
        width: "100%", maxWidth: "700px",
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)",
        borderRadius: "24px",
        boxShadow: "0 24px 80px rgba(0,119,182,.12),0 4px 20px rgba(0,0,0,.06)",
        display: "flex", flexDirection: "column",
        height: "min(88vh, 780px)", overflow: "hidden",
        border: "1px solid rgba(0,184,169,.15)"
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg,#023e8a 0%,#0077b6 50%,#00b8a9 100%)",
          padding: "20px 24px", display: "flex", alignItems: "center", gap: "14px"
        }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "14px",
            background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px"
          }}>🩺</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "white", fontWeight: "bold", fontSize: "20px" }}>MedAssist</div>
            <div style={{ color: "rgba(255,255,255,.75)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", fontFamily: "sans-serif" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse 2s infinite" }} />
              Medical Information Assistant · Always Online
            </div>
          </div>
          <PulseIcon />
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 8px" }}>
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", marginBottom: "16px" }}>
              <div style={{
                width: "34px", height: "34px", borderRadius: "50%",
                background: "linear-gradient(135deg,#00b8a9,#0077b6)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px"
              }}>🩺</div>
              <div style={{
                background: "white", borderRadius: "18px 18px 18px 4px",
                padding: "12px 16px", boxShadow: "0 2px 12px rgba(0,0,0,.08)",
                border: "1px solid rgba(0,184,169,.12)"
              }}>
                <TypingDots />
              </div>
            </div>
          )}
          {error && (
            <div style={{
              background: "#fff0f0", border: "1px solid #ffb3b3", borderRadius: "10px",
              padding: "10px 14px", fontSize: "13px", color: "#c0392b",
              marginBottom: "12px", fontFamily: "sans-serif"
            }}>
              ⚠️ Error: {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested questions */}
        {messages.length <= 1 && (
          <div style={{ padding: "0 16px 12px" }}>
            <div style={{ fontSize: "11px", color: "#8fa6b2", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "sans-serif" }}>
              Common Questions
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {suggestedQuestions.map((q, i) => (
                <button key={i} className="suggest" onClick={() => sendMessage(q)} style={{
                  background: "rgba(0,184,169,.06)", border: "1px solid rgba(0,184,169,.25)",
                  borderRadius: "20px", padding: "6px 12px", fontSize: "12px", color: "#0077b6",
                  cursor: "pointer", transition: "all .2s", fontFamily: "sans-serif"
                }}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {/* Document badge */}
        {documentName && <DocumentBadge fileName={documentName} onRemove={removeDocument} />}

        {/* Disclaimer */}
        <div style={{
          background: "rgba(255,193,7,.1)", border: "1px solid rgba(255,193,7,.3)",
          borderRadius: "8px", padding: "10px 14px", margin: "0 16px 12px",
          display: "flex", gap: "8px", fontSize: "12px", color: "#b8860b",
          lineHeight: "1.5", fontFamily: "sans-serif"
        }}>
          <span style={{ fontSize: "14px", flexShrink: 0 }}>⚠️</span>
          <span><strong>Medical Disclaimer:</strong> This chatbot provides general health information only and is not a substitute for professional medical advice, diagnosis, or treatment.</span>
        </div>

        {/* Input row */}
        <div style={{
          padding: "12px 16px 16px", borderTop: "1px solid rgba(0,184,169,.12)",
          display: "flex", gap: "8px", alignItems: "flex-end"
        }}>
          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current.click()}
            disabled={uploading}
            title="Upload PDF or TXT file"
            style={{
              width: "44px", height: "44px", borderRadius: "13px",
              background: documentName ? "rgba(0,184,169,0.15)" : "rgba(0,119,182,0.08)",
              border: `1.5px solid ${documentName ? "#00b8a9" : "rgba(0,119,182,0.25)"}`,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: documentName ? "#00b8a9" : "#0077b6", flexShrink: 0, transition: "all .2s"
            }}>
            {uploading ? "⏳" : <UploadIcon />}
          </button>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={documentName ? `Ask about ${documentName}…` : "Ask a medical question… (Shift+Enter for new line)"}
            rows={1}
            style={{
              flex: 1, resize: "none",
              border: "1.5px solid rgba(0,184,169,.3)", borderRadius: "14px",
              padding: "11px 14px", fontSize: "14px", color: "#1a2332",
              background: "rgba(248,252,255,.9)", lineHeight: "1.5",
              fontFamily: "Georgia, serif", maxHeight: "120px",
              transition: "border-color .2s", boxSizing: "border-box"
            }}
            onFocus={e => e.target.style.borderColor = "#00b8a9"}
            onBlur={e => e.target.style.borderColor = "rgba(0,184,169,.3)"}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          />
          <button className="send" onClick={() => sendMessage()} disabled={!input.trim() || loading}
            style={{
              width: "44px", height: "44px", borderRadius: "13px",
              background: "linear-gradient(135deg,#0077b6,#00b8a9)", border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", flexShrink: 0, transition: "all .2s",
              boxShadow: "0 4px 14px rgba(0,119,182,.35)"
            }}>
            <SendIcon />
          </button>
        </div>
      </div>

      <div style={{
        textAlign: "center",
        padding: "10px",
        fontSize: "11px",
        color: "#8fa6b2",
        fontFamily: "sans-serif",
        borderTop: "1px solid rgba(0,184,169,.08)"
      }}>
        © 2026 Aditya Shanghavi. All Rights Reserved.
      </div>

    </div>
  );
}
