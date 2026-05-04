import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

const STEPS = [
  {
    icon: "✦",
    title: "Create AI Videos",
    desc: "Type a message or idea → EdgeStudio generates a background, writes a script, records a voiceover, and exports a ready-to-post short video.",
  },
  {
    icon: "✂",
    title: "Clip Any YouTube Video",
    desc: "Paste any YouTube URL → AI finds the 3–5 most viral moments, clips them, and burns in captions. Takes about 2 minutes.",
  },
  {
    icon: "▦",
    title: "Save on Phone, Download on PC",
    desc: "Generate from your phone in bed, hit 'Save to Account', then log in on your laptop to download the final video.",
  },
];

export default function OnboardingModal({ onClose }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  function finish() {
    localStorage.setItem("es_onboarded", "1");
    onClose?.();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}
    >
      <div className="glass-card fade-in" style={{ width: "100%", maxWidth: 440, padding: "2rem", position: "relative" }}>

        {/* Skip */}
        <button
          onClick={finish}
          style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", color: "#4e4b48", fontSize: "0.72rem", cursor: "pointer", fontFamily: "inherit" }}
        >
          Skip
        </button>

        {/* Logo mark */}
        <div style={{ marginBottom: "1.5rem" }}>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", letterSpacing: "-0.03em" }}>
            <span style={{ color: "var(--accent)" }}>Edge</span>
            <span style={{ color: "#f0ede8" }}>Studio</span>
          </span>
          <span style={{ marginLeft: "0.5rem", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent)", borderRadius: 5, padding: "0.15rem 0.4rem" }}>BETA</span>
        </div>

        {/* Step content */}
        <div style={{ minHeight: 140 }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>{STEPS[step].icon}</div>
          <h2 style={{ margin: "0 0 0.6rem", fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.03em" }}>
            {STEPS[step].title}
          </h2>
          <p style={{ margin: 0, fontSize: "0.875rem", color: "#8a8480", lineHeight: 1.6 }}>
            {STEPS[step].desc}
          </p>
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "0.4rem", margin: "1.5rem 0 1.25rem" }}>
          {STEPS.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ height: 3, flex: 1, borderRadius: 2, background: i === step ? "var(--accent)" : "rgba(255,255,255,0.1)", cursor: "pointer", transition: "background 0.2s" }} />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.65rem" }}>
          {step > 0 && (
            <button
              className="btn-ghost"
              style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", borderRadius: 10 }}
              onClick={() => setStep(s => s - 1)}
            >
              ← Back
            </button>
          )}
          <button
            className="btn-accent"
            style={{ flex: 1, padding: "0.75rem", fontSize: "0.9rem", borderRadius: 10, fontWeight: 700 }}
            onClick={() => isLast ? finish() : setStep(s => s + 1)}
          >
            {isLast ? "Let's go →" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook — returns true if onboarding should show
export function useOnboarding() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    const done = localStorage.getItem("es_onboarded");
    if (!done) setShow(true);
  }, [user]);

  return { show, dismiss: () => { localStorage.setItem("es_onboarded", "1"); setShow(false); } };
}
