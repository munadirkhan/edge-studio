import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AuthModal({ onClose }) {
  const { signInWithGoogle, signInWithEmail, continueAsGuest } = useAuth();
  const [mode, setMode]       = useState("login"); // "login" | "signup"
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleEmail(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await signInWithEmail(email, password, mode === "signup");
      if (error) throw error;
      if (mode === "signup") setSent(true);
      else onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    continueAsGuest();
    onClose?.();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
    }}>
      <div className="glass-card" style={{
        width: "100%", maxWidth: 400, padding: "2rem",
        position: "relative", animation: "fadeIn 0.2s ease",
      }}>
        {/* Close */}
        <button onClick={onClose} style={{
          position: "absolute", top: 14, right: 16,
          background: "none", border: "none", color: "#5a5755",
          fontSize: "1.2rem", cursor: "pointer", lineHeight: 1,
        }}>✕</button>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{ fontWeight: 800, fontSize: "1.4rem", color: "var(--accent)", letterSpacing: "-0.01em" }}>
            EdgeStudio
          </div>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "#5a5755" }}>
            {mode === "signup" ? "Create your account" : "Sign in to save your clips"}
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📬</div>
            <p style={{ fontSize: "0.9rem", color: "#c0b8b0" }}>Check your email to confirm your account.</p>
          </div>
        ) : (
          <>
            {/* Google */}
            <button
              onClick={signInWithGoogle}
              style={{
                width: "100%", padding: "0.75rem", marginBottom: "0.75rem",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem",
                background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)",
                borderRadius: 10, cursor: "pointer", color: "#f0ede8",
                fontSize: "0.875rem", fontWeight: 600, fontFamily: "inherit",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
            >
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.3 1.2 8.4 3.1l6.3-6.3C34.8 2.9 29.7 1 24 1 14.8 1 7 6.7 3.5 14.6l7.3 5.7C12.5 14 17.8 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 2.9-2.3 5.3-4.8 6.9l7.4 5.7c4.3-4 6.8-9.9 6.8-16.6z"/>
                <path fill="#FBBC05" d="M10.8 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7L3 13.6A23.9 23.9 0 0 0 .5 24c0 3.8.9 7.4 2.5 10.5l7.8-5.8z"/>
                <path fill="#34A853" d="M24 47c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.2 1.4-5 2.3-8.5 2.3-6.2 0-11.5-4.2-13.4-9.8l-7.3 5.7C7 40.3 14.8 47 24 47z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: "0.7rem", color: "#4a4745" }}>or</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmail} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <input
                className="input-base"
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ padding: "0.7rem 1rem", fontSize: "0.875rem" }}
              />
              <input
                className="input-base"
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ padding: "0.7rem 1rem", fontSize: "0.875rem" }}
              />
              {error && <p style={{ margin: 0, fontSize: "0.75rem", color: "#f87171" }}>{error}</p>}
              <button
                type="submit"
                className="btn-accent"
                disabled={loading}
                style={{ padding: "0.75rem", fontSize: "0.875rem" }}
              >
                {loading ? "..." : mode === "signup" ? "Create Account" : "Sign In"}
              </button>
            </form>

            <p style={{ margin: "1rem 0 0", textAlign: "center", fontSize: "0.75rem", color: "#5a5755" }}>
              {mode === "login" ? "No account? " : "Have an account? "}
              <button
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
                style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", fontWeight: 600 }}
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>

            <div style={{ margin: "1.25rem 0 0", borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
              <button
                onClick={handleGuest}
                style={{
                  width: "100%", padding: "0.65rem", background: "none",
                  border: "1px solid var(--border)", borderRadius: 10,
                  color: "#5a5755", fontSize: "0.8rem", cursor: "pointer",
                  fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = "#a09888"; e.currentTarget.style.borderColor = "#4a4745"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#5a5755"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                Continue as Guest — clips won't be saved
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
