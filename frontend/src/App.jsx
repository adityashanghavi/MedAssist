import { useState, useRef, useEffect } from "react";

const API_URL = "https://medassist-production-aa9a.up.railway.app";

const suggestedQuestions = [
  "What are common symptoms of Type 2 diabetes?",
  "How does high blood pressure affect the body?",
  "What's the difference between viral and bacterial infections?",
  "When should I see a doctor for chest pain?",
];

const PulseIcon = () => (
  <div style={{
    width: "38px", height: "38px", borderRadius: "10px",
    background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,255,255,0.25)",
    fontFamily: "Georgia, serif", fontWeight: "bold",
    fontSize: "14px", color: "white", letterSpacing: "1px",
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
      marginBottom: "18px", animation: "fadeSlideIn 0.3s ease forwards",
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
        maxWidth: "65%",
        background: isUser ? "linear-gradient(135deg, #0077b6, #00b8a9)" : "white",
        color: isUser ? "white" : "#1a2332",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        padding: "13px 17px", fontSize: "14.5px", lineHeight: "1.7",
        boxShadow: isUser ? "0 4px 16px rgba(0,119,182,0.25)" : "0 2px 12px rgba(0,0,0,0.07)",
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
      borderRadius: "10px", padding: "8px 12px", marginBottom: "10px",
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
    e.target.value = "";

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
        const text = await file.text();
        setDocumentText(text);
        setDocumentName(file.name);
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `📄 I've loaded "${file.name}". Ask me anything about it!`
        }]);
      } else {
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
      height: "100vh", width: "100vw", display: "flex", flexDirection: "column",
      background: "#ffffff", fontFamily: "'Georgia', serif", overflow: "hidden"
    }}>
      <style>{`
        html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-6px);opacity:1} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        textarea:focus{outline:none}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(0,184,169,.25);border-radius:10px}
        ::-webkit-scrollbar-thumb:hover{background:rgba(0,184,169,.45)}
        .suggest:hover{background:rgba(0,184,169,.12)!important;border-color:#00b8a9!important;color:#005f8f!important}
        .send:hover:not(:disabled){filter:brightness(1.1);transform:scale(1.05)}
        .send:disabled{opacity:.45;cursor:not-allowed}
        .upload-btn:hover{background:rgba(0,184,169,0.15)!important;}
      `}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #023e8a 0%, #0077b6 55%, #00b8a9 100%)",
        padding: "0 32px", height: "64px", flexShrink: 0,
        display: "flex", alignItems: "center", gap: "14px",
        boxShadow: "0 2px 16px rgba(2,62,138,0.18)"
      }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "12px",
          background: "rgba(255,255,255,.15)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px",
          border: "1px solid rgba(255,255,255,0.2)", flexShrink: 0
        }}>🩺</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: "white", fontWeight: "bold", fontSize: "18px", letterSpacing: "0.3px" }}>MedAssist</div>
          <div style={{ color: "rgba(255,255,255,.7)", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", fontFamily: "sans-serif" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#4ade80", display: "inline-block", animation: "pulse 2s infinite", flexShrink: 0 }} />
            Medical Information Assistant · Always Online
          </div>
        </div>
        <PulseIcon />
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto", background: "#ffffff" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "28px 32px 12px" }}>
          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {loading && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", marginBottom: "18px" }}>
              <div style={{
                width: "34px", height: "34px", borderRadius: "50%",
                background: "linear-gradient(135deg,#00b8a9,#0077b6)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", flexShrink: 0
              }}>🩺</div>
              <div style={{
                background: "white", borderRadius: "18px 18px 18px 4px",
                padding: "12px 16px", boxShadow: "0 2px 12px rgba(0,0,0,.07)",
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
              marginBottom: "14px", fontFamily: "sans-serif"
            }}>
              ⚠️ Error: {error}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Bottom panel */}
      <div style={{
        background: "white", borderTop: "1px solid rgba(0,184,169,.15)",
        boxShadow: "0 -4px 24px rgba(0,119,182,.06)", flexShrink: 0
      }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "14px 32px 16px" }}>

          {/* Suggested questions */}
          {messages.length <= 1 && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "11px", color: "#8fa6b2", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.8px", fontFamily: "sans-serif" }}>
                Common Questions
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {suggestedQuestions.map((q, i) => (
                  <button key={i} className="suggest" onClick={() => sendMessage(q)} style={{
                    background: "rgba(0,184,169,.06)", border: "1px solid rgba(0,184,169,.25)",
                    borderRadius: "20px", padding: "6px 14px", fontSize: "12.5px", color: "#0077b6",
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
            background: "rgba(255,193,7,.08)", border: "1px solid rgba(255,193,7,.28)",
            borderRadius: "8px", padding: "9px 13px", marginBottom: "12px",
            display: "flex", gap: "8px", fontSize: "12px", color: "#9a7000",
            lineHeight: "1.5", fontFamily: "sans-serif"
          }}>
            <span style={{ fontSize: "14px", flexShrink: 0 }}>⚠️</span>
            <span><strong>Medical Disclaimer:</strong> This chatbot provides general health information only and is not a substitute for professional medical advice, diagnosis, or treatment.</span>
          </div>

          {/* Input row */}
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
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
                background: documentName ? "rgba(0,184,169,0.12)" : "rgba(0,119,182,0.07)",
                border: `1.5px solid ${documentName ? "#00b8a9" : "rgba(0,119,182,0.22)"}`,
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
                padding: "11px 16px", fontSize: "14px", color: "#1a2332",
                background: "#f8fcff", lineHeight: "1.5",
                fontFamily: "Georgia, serif", maxHeight: "120px",
                transition: "border-color .2s, box-shadow .2s", boxSizing: "border-box"
              }}
              onFocus={e => { e.target.style.borderColor = "#00b8a9"; e.target.style.boxShadow = "0 0 0 3px rgba(0,184,169,.1)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(0,184,169,.3)"; e.target.style.boxShadow = "none"; }}
              onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
            />
            <button className="send" onClick={() => sendMessage()} disabled={!input.trim() || loading}
              style={{
                width: "44px", height: "44px", borderRadius: "13px",
                background: "linear-gradient(135deg,#0077b6,#00b8a9)", border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", flexShrink: 0, transition: "all .2s",
                boxShadow: "0 4px 14px rgba(0,119,182,.3)"
              }}>
              <SendIcon />
            </button>
          </div>

          {/* Copyright */}
          <div style={{
            textAlign: "center", paddingTop: "10px",
            fontSize: "11px", color: "#a0b4be", fontFamily: "sans-serif"
          }}>
            © 2026 Aditya Shanghavi. All Rights Reserved.
          </div>
        </div>
      </div>
    </div>
  );
}
