import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const TIERS = [
  {
    key: "free",
    label: "FREE",
    price: null,
    accent: false,
    features: [
      "5 video exports",
      "AI image generation",
      "AI voiceover",
      "ClipStudio: 1 URL at a time",
      "Save to account",
      "EdgeStudio watermark",
    ],
    dimFeatures: [4, 5], // indexes of greyed/locked items
  },
  {
    key: "starter",
    label: "STARTER",
    price: "$5/mo",
    accent: false,
    badge: null,
    features: [
      "20 video exports",
      "AI image generation",
      "AI voiceover",
      "ClipStudio: up to 3 URLs",
      "Save to account",
      "No watermark",
    ],
    dimFeatures: [],
  },
  {
    key: "pro",
    label: "PRO",
    price: "$10/mo",
    accent: true,
    badge: "BEST VALUE",
    features: [
      "Unlimited exports",
      "AI image generation",
      "AI voiceover",
      "ClipStudio: up to 5 URLs",
      "Save to account",
      "No watermark",
      "Early access to new features",
    ],
    dimFeatures: [],
  },
];

export default function PaywallModal({ onClose, exportsUsed = 0, currentPlan = "free" }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(null); // "starter" | "pro" | null

  async function handleUpgrade(plan) {
    if (!user) return;
    setLoading(plan);
    try {
      const { data: { session } } = await import("../lib/supabase").then(m => m.supabase.auth.getSession());
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ plan, returnUrl: window.location.href }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to start checkout");
      }
    } catch (err) {
      alert("Checkout error: " + err.message);
      setLoading(null);
    }
  }

  const freeTier     = TIERS[0];
  const starterTier  = TIERS[1];
  const proTier      = TIERS[2];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div className="glass-card fade-in" style={{ width: "100%", maxWidth: 580, padding: "2rem", position: "relative" }}>

        <button
          onClick={onClose}
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#5a5755", fontSize: "1.1rem", cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}
        >✕</button>

        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ fontSize: "1.75rem", marginBottom: "0.4rem" }}>⚡</div>
          <h2 style={{ margin: "0 0 0.4rem", fontSize: "1.35rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
            Unlock more exports
          </h2>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#6e6a66" }}>
            You've used <strong style={{ color: "#c9a96e" }}>{exportsUsed}</strong> of your 5 free exports.
          </p>
        </div>

        {/* 3-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.65rem", marginBottom: "1.5rem" }}>
          {TIERS.map(tier => (
            <div
              key={tier.key}
              style={{
                padding: "1rem",
                borderRadius: 10,
                border: `1px solid ${tier.accent ? "var(--accent-border)" : "var(--border)"}`,
                background: tier.accent ? "var(--accent-dim)" : "rgba(255,255,255,0.02)",
                position: "relative",
              }}
            >
              {tier.badge && (
                <div style={{ position: "absolute", top: "-10px", left: "50%", transform: "translateX(-50%)", fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.08em", background: "var(--accent)", color: "#0a0806", borderRadius: 5, padding: "0.2rem 0.5rem", whiteSpace: "nowrap" }}>
                  {tier.badge}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem", marginBottom: "0.75rem" }}>
                <p style={{ margin: 0, fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.06em", color: tier.accent ? "var(--accent)" : "#5a5755" }}>{tier.label}</p>
                {tier.price && <span style={{ fontSize: "0.75rem", fontWeight: 800, color: tier.accent ? "var(--accent)" : "#c0b8b0" }}>{tier.price}</span>}
              </div>
              {tier.features.map((f, i) => (
                <div key={f} style={{ display: "flex", gap: "0.35rem", alignItems: "flex-start", marginBottom: "0.35rem" }}>
                  <span style={{ fontSize: "0.65rem", flexShrink: 0, marginTop: 2, color: tier.dimFeatures.includes(i) ? "#3a3835" : tier.accent ? "var(--accent)" : "#6e6a66" }}>
                    {tier.dimFeatures.includes(i) ? "✕" : "✓"}
                  </span>
                  <span style={{ fontSize: "0.68rem", color: tier.dimFeatures.includes(i) ? "#3a3835" : tier.accent ? "#c0b8b0" : "#6e6a66", lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
          <button
            className="btn-ghost"
            style={{ padding: "0.8rem", fontSize: "0.88rem", borderRadius: 10, fontWeight: 700 }}
            onClick={() => handleUpgrade("starter")}
            disabled={loading !== null || currentPlan === "starter" || currentPlan === "pro"}
          >
            {loading === "starter" ? "Redirecting…" : currentPlan === "starter" ? "Current plan" : "Get Starter — $5/mo"}
          </button>
          <button
            className="btn-accent"
            style={{ padding: "0.8rem", fontSize: "0.88rem", borderRadius: 10, fontWeight: 800 }}
            onClick={() => handleUpgrade("pro")}
            disabled={loading !== null || currentPlan === "pro"}
          >
            {loading === "pro" ? "Redirecting…" : currentPlan === "pro" ? "Current plan" : "Get Pro — $10/mo →"}
          </button>
        </div>

        <p style={{ margin: "0.75rem 0 0", textAlign: "center", fontSize: "0.65rem", color: "#4e4b48" }}>
          Cancel anytime · Billed monthly via Stripe
        </p>
      </div>
    </div>
  );
}
