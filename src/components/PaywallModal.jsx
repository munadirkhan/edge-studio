import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const FREE_FEATURES = [
  "7 video exports total",
  "AI image generation",
  "AI voiceover",
  "Save to account",
  "All templates",
];

const PRO_FEATURES = [
  "Unlimited exports",
  "ClipStudio: YouTube → clips",
  "Bulk processing (5 URLs at once)",
  "Priority generation",
  "Early access to new features",
];

export default function PaywallModal({ onClose, exportsUsed = 3, onUpgrade }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    if (!user) return;
    setLoading(true);
    try {
      const { data: { session } } = await import("../lib/supabase").then(m => m.supabase.auth.getSession());
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to start checkout");
      }
    } catch (err) {
      alert("Checkout error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div className="glass-card fade-in" style={{ width: "100%", maxWidth: 480, padding: "2rem", position: "relative" }}>

        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#5a5755", fontSize: "1.1rem", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}
        >✕</button>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚡</div>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
            You've used your {exportsUsed}/7 free exports
          </h2>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6e6a66" }}>
            Upgrade to Pro for unlimited exports and ClipStudio access.
          </p>
        </div>

        {/* Comparison */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.75rem" }}>
          {/* Free */}
          <div style={{ padding: "1rem", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", color: "#5a5755" }}>FREE</p>
            {FREE_FEATURES.map(f => (
              <div key={f} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                <span style={{ color: "#4a4745", fontSize: "0.7rem", flexShrink: 0, marginTop: 2 }}>○</span>
                <span style={{ fontSize: "0.72rem", color: "#6e6a66", lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Pro */}
          <div style={{ padding: "1rem", borderRadius: 10, border: "1px solid var(--accent-border)", background: "var(--accent-dim)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--accent)" }}>PRO</p>
              <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--accent)" }}>$12/mo</span>
            </div>
            {PRO_FEATURES.map(f => (
              <div key={f} style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                <span style={{ color: "var(--accent)", fontSize: "0.7rem", flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: "0.72rem", color: "#c0b8b0", lineHeight: 1.4 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          className="btn-accent"
          style={{ width: "100%", padding: "0.9rem", fontSize: "1rem", borderRadius: 12, fontWeight: 800, letterSpacing: "-0.01em" }}
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? "Redirecting to checkout…" : "Upgrade to Pro — $7/mo →"}
        </button>

        <p style={{ margin: "0.75rem 0 0", textAlign: "center", fontSize: "0.68rem", color: "#4e4b48" }}>
          Cancel anytime · Billed monthly via Stripe
        </p>
      </div>
    </div>
  );
}
