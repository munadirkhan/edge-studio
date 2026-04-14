import { useState, useCallback } from "react";

// Singleton export queue — import startExport() anywhere
let _addToQueue = null;

export function startExport(clip) {
  if (_addToQueue) _addToQueue(clip);
}

export default function ExportQueue() {
  const [items, setItems] = useState([]);
  const [minimized, setMinimized] = useState(false);

  const addToQueue = useCallback(async (clip) => {
    const id = clip.rank + "-" + Date.now();
    const item = { id, title: clip.title, progress: 0, status: "downloading" };

    setItems(prev => [...prev, item]);
    setMinimized(false);

    try {
      const response = await fetch(clip.downloadUrl);
      const contentLength = response.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength) : null;

      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        const progress = total ? Math.round((received / total) * 100) : null;
        setItems(prev => prev.map(i => i.id === id ? { ...i, progress: progress ?? 50 } : i));
      }

      // Build blob and trigger download
      const blob = new Blob(chunks);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${clip.title?.replace(/[^a-z0-9]/gi, "_") || "clip"}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setItems(prev => prev.map(i => i.id === id ? { ...i, progress: 100, status: "done" } : i));
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 3000);
    } catch {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: "failed" } : i));
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 4000);
    }
  }, []);

  // Register global handler
  _addToQueue = addToQueue;

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 999,
      width: 320, background: "#0e0e12",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, overflow: "hidden",
      boxShadow: "0 16px 60px rgba(0,0,0,0.6)",
      animation: "fadeIn 0.2s ease",
    }}>
      {/* Header */}
      <div style={{
        padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: minimized ? "none" : "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem" }}>↓</span>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#f0ede8" }}>Export Queue</span>
          <span style={{
            fontSize: "0.62rem", fontWeight: 700, background: "var(--accent-dim)",
            color: "var(--accent)", borderRadius: 5, padding: "0.1rem 0.45rem",
            border: "1px solid var(--accent-border)",
          }}>{items.length}</span>
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            onClick={() => setMinimized(!minimized)}
            style={{ background: "none", border: "none", color: "#4a4745", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0.1rem 0.3rem" }}
          >
            {minimized ? "▲" : "▼"}
          </button>
          <button
            onClick={() => setItems([])}
            style={{ background: "none", border: "none", color: "#4a4745", cursor: "pointer", fontSize: "0.9rem", lineHeight: 1, padding: "0.1rem 0.3rem" }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Items */}
      {!minimized && (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {items.map(item => (
            <div key={item.id} style={{ padding: "0.85rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <p style={{ margin: 0, fontSize: "0.78rem", fontWeight: 600, color: "#c0b8b0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }}>
                  {item.title}
                </p>
                <span style={{ fontSize: "0.68rem", color: item.status === "done" ? "#4ade80" : item.status === "failed" ? "#f87171" : "#5a5755", flexShrink: 0, marginLeft: "0.5rem" }}>
                  {item.status === "done" ? "Done ✓" : item.status === "failed" ? "Failed" : `${item.progress}%`}
                </span>
              </div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  background: item.status === "done" ? "#4ade80" : item.status === "failed" ? "#f87171" : "var(--accent)",
                  width: `${item.progress}%`,
                  transition: "width 0.3s ease",
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
