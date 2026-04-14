import { useState } from "react";

export default function CopyrightModal({ clipTitle, onConfirm, onClose }) {
  const [checked1, setChecked1] = useState(false);
  const [checked2, setChecked2] = useState(false);

  const ready = checked1 && checked2;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }}>
      <div style={{
        width: "100%", maxWidth: 420,
        background: "#0e0e12", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20, overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
      }}>
        {/* Header */}
        <div style={{ padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.1rem" }}>⚖️</span>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f0ede8" }}>Before you export</span>
          </div>
          <p style={{ margin: 0, fontSize: "0.78rem", color: "#4a4745", lineHeight: 1.5 }}>
            Please confirm you have the rights to use this content before downloading.
          </p>
          {clipTitle && (
            <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#7a7472", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {clipTitle}
              </p>
            </div>
          )}
        </div>

        {/* Checkboxes */}
        <div style={{ padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          {[
            { state: checked1, set: setChecked1, label: "I own or have explicit permission to use this video content." },
            { state: checked2, set: setChecked2, label: "I understand that posting copyrighted content without permission may violate YouTube, TikTok, and Instagram policies." },
          ].map(({ state, set, label }, i) => (
            <label key={i} style={{ display: "flex", gap: "0.75rem", cursor: "pointer", alignItems: "flex-start" }}>
              <div
                onClick={() => set(!state)}
                style={{
                  width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 1,
                  border: `1.5px solid ${state ? "var(--accent)" : "rgba(255,255,255,0.12)"}`,
                  background: state ? "var(--accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s", cursor: "pointer",
                }}
              >
                {state && <span style={{ fontSize: "0.65rem", color: "#0a0806", fontWeight: 800 }}>✓</span>}
              </div>
              <span style={{ fontSize: "0.8rem", color: "#7a7472", lineHeight: 1.5 }}>{label}</span>
            </label>
          ))}
        </div>

        {/* Actions */}
        <div style={{ padding: "0 1.5rem 1.5rem", display: "flex", gap: "0.65rem" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "0.7rem", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
              background: "transparent", color: "#5a5755", cursor: "pointer", fontFamily: "inherit",
              fontSize: "0.85rem", fontWeight: 600, transition: "all 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            Cancel
          </button>
          <button
            onClick={() => ready && onConfirm()}
            disabled={!ready}
            style={{
              flex: 2, padding: "0.7rem", borderRadius: 12, border: "none",
              background: ready ? "var(--accent)" : "rgba(255,255,255,0.06)",
              color: ready ? "#0a0806" : "#3a3735",
              cursor: ready ? "pointer" : "not-allowed",
              fontFamily: "inherit", fontSize: "0.85rem", fontWeight: 700,
              transition: "all 0.2s",
            }}
          >
            ↓ Export Clip
          </button>
        </div>
      </div>
    </div>
  );
}
