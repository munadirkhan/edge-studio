import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import FeedbackModal from "./FeedbackModal";
import AuthModal from "./AuthModal";

const NAV = [
  { id: "home",    icon: "⌂", label: "Home"     },
  { id: "clip",    icon: "✂", label: "Clip"     },
  { id: "create",  icon: "✦", label: "Create"   },
  { id: "projects",icon: "▦", label: "Projects" },
];

export default function Sidebar({ mode, setMode }) {
  const { user, signOut } = useAuth();
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAuth, setShowAuth]         = useState(false);

  function navigate(id) {
    if (id === "home")     setMode(null);
    else if (id === "projects") return; // future
    else setMode(id);
  }

  const active = mode === null ? "home" : mode === "create" ? "create" : mode === "clip" ? "clip" : null;

  return (
    <>
      <aside style={{
        width: 220, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
        borderRight: "1px solid var(--border)",
        background: "rgba(6,6,9,0.97)",
        display: "flex", flexDirection: "column",
        backdropFilter: "blur(20px)",
        zIndex: 20,
      }}>
        {/* Logo */}
        <div style={{ padding: "1.5rem 1.25rem 1rem", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 800, fontSize: "1.2rem", letterSpacing: "-0.03em" }}>
              <span style={{ color: "var(--accent)" }}>Edge</span>
              <span style={{ color: "#f0ede8" }}>Studio</span>
            </span>
            <span style={{
              fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em",
              background: "var(--accent-dim)", border: "1px solid var(--accent-border)",
              color: "var(--accent)", borderRadius: 5, padding: "0.15rem 0.4rem",
            }}>BETA</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.4rem" }}>
            <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
            <span style={{ fontSize: "0.62rem", color: "#6e6a66", letterSpacing: "0.06em" }}>JARVIS ONLINE</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0.75rem 0.75rem", display: "flex", flexDirection: "column", gap: "0.2rem", overflowY: "auto" }}>
          {NAV.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.7rem",
                  padding: "0.6rem 0.85rem", borderRadius: 10, border: "none",
                  background: isActive ? "rgba(201,169,110,0.1)" : "transparent",
                  color: isActive ? "var(--accent)" : "#7a7672",
                  cursor: item.id === "projects" ? "default" : "pointer",
                  fontFamily: "inherit", fontSize: "0.875rem", fontWeight: isActive ? 600 : 400,
                  transition: "all 0.15s", textAlign: "left", width: "100%",
                  opacity: item.id === "projects" ? 0.4 : 1,
                }}
                onMouseEnter={e => { if (item.id !== "projects" && !isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: "0.85rem", width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === "projects" && (
                  <span style={{ marginLeft: "auto", fontSize: "0.55rem", background: "rgba(255,255,255,0.06)", borderRadius: 4, padding: "0.1rem 0.4rem", color: "#6e6a66" }}>SOON</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: "0.75rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          <button
            onClick={() => setShowFeedback(true)}
            style={{
              display: "flex", alignItems: "center", gap: "0.7rem",
              padding: "0.6rem 0.85rem", borderRadius: 10, border: "none",
              background: "transparent", color: "#7a7672",
              cursor: "pointer", fontFamily: "inherit", fontSize: "0.875rem",
              transition: "all 0.15s", textAlign: "left", width: "100%",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: "0.85rem", width: 18, textAlign: "center" }}>◎</span>
            <span>Submit Feedback</span>
          </button>

          {user ? (
            <div style={{ padding: "0.75rem 0.85rem", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.72rem", color: "#8a8480", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </p>
              <button
                onClick={signOut}
                style={{ fontSize: "0.72rem", color: "#9a9490", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, transition: "color 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.color = "#f0ede8"}
                onMouseLeave={e => e.currentTarget.style.color = "#9a9490"}
              >
                Sign out →
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                padding: "0.65rem 0.85rem", borderRadius: 10,
                border: "1px solid var(--accent-border)",
                background: "var(--accent-dim)",
                color: "var(--accent)",
                cursor: "pointer", fontFamily: "inherit", fontSize: "0.82rem", fontWeight: 600,
                transition: "all 0.15s", width: "100%",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(201,169,110,0.16)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.35)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--accent-dim)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
            >
              <span style={{ fontSize: "0.75rem" }}>◉</span>
              <span>Sign in to save clips</span>
            </button>
          )}
        </div>
      </aside>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
      {showAuth     && <AuthModal     onClose={() => setShowAuth(false)} />}
    </>
  );
}
