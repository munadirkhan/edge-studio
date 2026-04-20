import { createContext, useContext, useState, useCallback } from "react";

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = "info") => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const toast = {
    success: msg => show(msg, "success"),
    error:   msg => show(msg, "error"),
    info:    msg => show(msg, "info"),
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{
        position: "fixed", bottom: "1.5rem", right: "1.5rem",
        display: "flex", flexDirection: "column-reverse", gap: "0.5rem",
        zIndex: 9999, pointerEvents: "none", maxWidth: 360,
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className="fade-in"
            style={{
              padding: "0.75rem 1.1rem",
              borderRadius: 10,
              background:
                t.type === "error"   ? "rgba(239,68,68,0.1)"   :
                t.type === "success" ? "rgba(74,222,128,0.1)"  :
                                       "rgba(255,255,255,0.07)",
              border: `1px solid ${
                t.type === "error"   ? "rgba(239,68,68,0.28)"   :
                t.type === "success" ? "rgba(74,222,128,0.28)"  :
                                       "rgba(255,255,255,0.12)"
              }`,
              color:
                t.type === "error"   ? "#f87171" :
                t.type === "success" ? "#4ade80"  :
                                       "#f0ede8",
              fontSize: "0.82rem",
              fontWeight: 500,
              backdropFilter: "blur(16px)",
              pointerEvents: "auto",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              letterSpacing: "-0.01em",
            }}
          >
            <span style={{ flexShrink: 0, fontWeight: 800 }}>
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "·"}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
