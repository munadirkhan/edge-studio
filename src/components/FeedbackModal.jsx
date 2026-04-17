import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const TYPES = ["Bug report", "Feature request", "General feedback", "Other"];

export default function FeedbackModal({ onClose }) {
  const { user } = useAuth();
  const [type, setType]       = useState("");
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText]       = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type || "General feedback",
          rating,
          message: text.trim(),
          userEmail: user?.email || "anonymous",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to send");
      }
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
    }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 420, padding: "2rem", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", color: "#4a4745", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>

        {sent ? (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🙏</div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "#f0ede8" }}>Thanks for the feedback</h3>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#5a5755" }}>We'll use this to make EdgeStudio better.</p>
          </div>
        ) : (
          <>
            <h3 style={{ margin: "0 0 0.3rem", fontSize: "1rem", fontWeight: 700, color: "#f0ede8" }}>Submit Feedback</h3>
            <p style={{ margin: "0 0 1.5rem", fontSize: "0.78rem", color: "#6e6a66" }}>Your input goes directly to the team.</p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <p style={{ margin: "0 0 0.4rem", fontSize: "0.65rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.08em" }}>TYPE</p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setType(t)} style={{
                      fontSize: "0.72rem", fontWeight: 600, padding: "0.3rem 0.7rem", borderRadius: 7,
                      border: `1px solid ${type === t ? "var(--accent-border)" : "var(--border)"}`,
                      background: type === t ? "var(--accent-dim)" : "transparent",
                      color: type === t ? "var(--accent)" : "#7a7672",
                      cursor: "pointer", fontFamily: "inherit",
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ margin: "0 0 0.4rem", fontSize: "0.65rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.08em" }}>RATING</p>
                <div style={{ display: "flex", gap: "0.3rem" }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button"
                      onMouseEnter={() => setHovered(n)}
                      onMouseLeave={() => setHovered(0)}
                      onClick={() => setRating(n)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", padding: "0.1rem", color: n <= (hovered || rating) ? "var(--accent)" : "#2a2825", transition: "color 0.1s" }}
                    >★</button>
                  ))}
                </div>
              </div>

              <div>
                <p style={{ margin: "0 0 0.4rem", fontSize: "0.65rem", fontWeight: 700, color: "#6e6a66", letterSpacing: "0.08em" }}>YOUR FEEDBACK</p>
                <textarea
                  className="input-base"
                  rows={4}
                  placeholder="Tell us what you think..."
                  value={text}
                  onChange={e => setText(e.target.value)}
                  required
                  style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", resize: "none", lineHeight: 1.55 }}
                />
              </div>

              {error && <p style={{ margin: 0, fontSize: "0.75rem", color: "#f87171" }}>{error}</p>}

              <button type="submit" className="btn-accent" disabled={loading || !text.trim()} style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                {loading ? "Sending..." : "Submit Feedback"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
