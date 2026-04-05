import { useState, useRef, useEffect } from "react";

const API_URL = "https://medassist-production-aa9a.up.railway.app";

const WELCOME_MESSAGE = "Hello! I'm MedAssist, your medical information companion created by Aditya Shanghavi. I can help answer general health questions, explain medical terms, or discuss symptoms and conditions.\n\nYou can also upload a PDF or TXT file and ask questions about it.\n\nHow can I help you today? Remember, for emergencies always call 911.";

const SendIcon = () => (
  <span style={{ fontSize: "18px", color: "white", lineHeight: 1 }}>↑</span>
);

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: "7px", height: "7px", borderRadius: "50%", background: "#0077b6",
          animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s`
        }} />
      ))}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px", animation: "fadeSlideIn 0.25s ease forwards" }}>
        <div style={{
          maxWidth: "60%", background: "#e8f4fb",
          color: "#1a2332", borderRadius: "18px 18px 4px 18px",
          padding: "12px 17px", fontSize: "15px", lineHeight: "1.65",
          whiteSpace: "pre-wrap", wordBreak: "break-word",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)"
        }}>
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: "12px", marginBottom: "24px", animation: "fadeSlideIn 0.25s ease forwards", alignItems: "flex-start" }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg, #0077b6, #00b8a9)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px",
        marginTop: "2px"
      }}>🩺</div>
      <div style={{
        flex: 1, fontSize: "15px", lineHeight: "1.75", color: "#1a2332",
        whiteSpace: "pre-wrap", wordBreak: "break-word", paddingTop: "4px"
      }}>
        {msg.content}
      </div>
    </div>
  );
}

function DocumentBadge({ fileName, onRemove }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: "7px",
      background: "rgba(0,119,182,0.08)", border: "1px solid rgba(0,119,182,0.2)",
      borderRadius: "8px", padding: "5px 10px", marginBottom: "8px",
      fontFamily: "sans-serif"
    }}>
      <span style={{ fontSize: "13px" }}>📄</span>
      <span style={{ fontSize: "12px", color: "#0077b6", fontWeight: "600",
        maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {fileName}
      </span>
      <button onClick={onRemove} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#999", fontSize: "14px", padding: "0 2px", lineHeight: 1
      }}>✕</button>
    </div>
  );
}

export default function MedicalChatbot() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [documentText, setDocumentText] = useState(null);
  const [documentName, setDocumentName] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const hasMessages = messages.length > 0;

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
        const res = await fetch(`${API_URL}/upload`, { method: "POST", body: formData });
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
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const newMessages = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, document_text: documentText || null })
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
      background: "#f8f8f8", fontFamily: "'Georgia', serif", overflow: "hidden"
    }}>
      <style>{`
        html, body, #root { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-6px);opacity:1} }
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }
        .send-btn:hover:not(:disabled) { background: #005f8f !important; }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .upload-btn:hover { background: rgba(0,0,0,0.06) !important; }
      `}</style>

      {/* Minimal header */}
      <div style={{
        height: "52px", flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center", gap: "12px",
        borderBottom: "1px solid rgba(0,0,0,0.07)",
        background: "linear-gradient(135deg, #023e8a 0%, #0077b6 55%, #00b8a9 100%)",
        boxShadow: "0 2px 12px rgba(2,62,138,0.2)"
      }}>
        <span style={{ fontSize: "20px" }}>🩺</span>
        <span style={{ fontWeight: "bold", fontSize: "16px", color: "white", letterSpacing: "0.2px" }}>MedAssist</span>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontFamily: "sans-serif" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.75)" }}>Always Online</span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {!hasMessages ? (
          /* Welcome state */
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "40px 24px 20px", textAlign: "center"
          }}>
            <div style={{ fontSize: "40px", marginBottom: "20px" }}>🩺</div>
            <h1 style={{
              fontSize: "clamp(22px, 3vw, 32px)", fontWeight: "bold", color: "#1a2332",
              margin: "0 0 20px", letterSpacing: "-0.3px", maxWidth: "600px", lineHeight: "1.3"
            }}>
              How can I help you today?
            </h1>
            <p style={{
              fontSize: "15px", color: "#555", lineHeight: "1.8",
              maxWidth: "520px", margin: 0, fontFamily: "sans-serif"
            }}>
              {WELCOME_MESSAGE}
            </p>
          </div>
        ) : (
          /* Chat messages */
          <div style={{ maxWidth: "720px", width: "100%", margin: "0 auto", padding: "32px 24px 16px" }}>
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && (
              <div style={{ display: "flex", gap: "12px", marginBottom: "24px", alignItems: "flex-start" }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #0077b6, #00b8a9)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px"
                }}>🩺</div>
                <div style={{ paddingTop: "8px" }}><TypingDots /></div>
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
        )}
      </div>

      {/* Input area */}
      <div style={{ flexShrink: 0, padding: "12px 24px 20px", background: "#f8f8f8" }}>
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>

          {documentName && <DocumentBadge fileName={documentName} onRemove={removeDocument} />}

          {/* Input card */}
          <div style={{
            background: "white", borderRadius: "16px",
            boxShadow: "0 2px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)",
            border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden"
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={documentName ? `Ask about ${documentName}…` : "Ask a medical question…"}
              rows={1}
              style={{
                width: "100%", resize: "none", border: "none",
                padding: "16px 18px 8px", fontSize: "15px", color: "#1a2332",
                background: "transparent", lineHeight: "1.55",
                fontFamily: "Georgia, serif", maxHeight: "140px",
                boxSizing: "border-box"
              }}
              onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
            />
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 12px 12px"
            }}>
              <input ref={fileInputRef} type="file" accept=".pdf,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
              <button
                className="upload-btn"
                onClick={() => fileInputRef.current.click()}
                disabled={uploading}
                title="Upload PDF or TXT"
                style={{
                  width: "34px", height: "34px", borderRadius: "8px",
                  background: "transparent", border: "1px solid rgba(0,0,0,0.12)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  color: documentName ? "#0077b6" : "#666", fontSize: "18px",
                  transition: "background .15s", fontWeight: "300",
                  outline: documentName ? "1.5px solid rgba(0,119,182,0.4)" : "none"
                }}>
                {uploading ? "⏳" : "+"}
              </button>
              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{
                  width: "34px", height: "34px", borderRadius: "8px",
                  background: "#0077b6", border: "none",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", transition: "background .15s",
                  boxShadow: "0 2px 8px rgba(0,119,182,0.3)"
                }}>
                <SendIcon />
              </button>
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{
            marginTop: "10px", textAlign: "center",
            fontSize: "11.5px", color: "#999", fontFamily: "sans-serif", lineHeight: "1.5"
          }}>
            ⚠️ <strong>Medical Disclaimer:</strong> For information only. Please consult your doctor for treatment plans.
          </div>
        </div>
      </div>
    </div>
  );
}
