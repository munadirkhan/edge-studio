import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

export default function ProjectsPage() {
  const { user, session } = useAuth();
  const [projects, setProjects]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [deleting, setDeleting]   = useState(null);
  const [playing, setPlaying]     = useState(null);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  async function fetchProjects() {
    setLoading(true); setError("");
    try {
      const token = session?.access_token;
      const res = await fetch("/api/projects", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
      const { projects } = await res.json();
      setProjects(projects || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(id) {
    if (!confirm("Delete this project?")) return;
    setDeleting(id);
    try {
      const token = session?.access_token;
      await fetch(`/api/projects/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setProjects(p => p.filter(p => p.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  function downloadAudio(project) {
    const a = document.createElement("a");
    a.href = project.audio_url;
    a.download = `${project.hook?.slice(0, 30) || "narration"}.mp3`;
    a.click();
  }

  if (!user) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "1rem" }}>
        <div style={{ fontSize: "2.5rem", opacity: 0.2 }}>▦</div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>Sign in to view your projects</p>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#6e6a66", textAlign: "center" }}>
          Generate a video on any device, save it to your account, and download it anywhere.
        </p>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.03em" }}>Your Projects</h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "#6e6a66" }}>
            {projects.length} saved · generate on phone, download on PC
          </p>
        </div>
        <button
          className="btn-ghost"
          style={{ padding: "0.5rem 0.85rem", fontSize: "0.8rem", borderRadius: 10 }}
          onClick={fetchProjects}
          disabled={loading}
        >
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "0.85rem 1rem", borderRadius: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", fontSize: "0.8rem", color: "#f87171" }}>
          {error}
        </div>
      )}

      {loading && !projects.length && (
        <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
          <div className="generating-ring" style={{ width: 36, height: 36 }} />
        </div>
      )}

      {!loading && !projects.length && !error && (
        <div className="glass-card" style={{ padding: "3rem 2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2rem", marginBottom: "1rem", opacity: 0.15 }}>▦</div>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "1rem" }}>No saved projects yet</p>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#6e6a66" }}>
            After generating a video, hit "Save to Account" to store it here.
          </p>
        </div>
      )}

      {/* Project grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
        {projects.map(p => (
          <div
            key={p.id}
            className="glass-card"
            style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
          >
            {/* Thumbnail */}
            <div style={{ position: "relative", background: "#0a0a0f", aspectRatio: "9/16", maxHeight: 220, overflow: "hidden" }}>
              <img
                src={p.image_url}
                alt={p.hook || "Project"}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)" }} />
              {/* Template badge */}
              <div style={{ position: "absolute", top: 8, left: 8, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "0.2rem 0.5rem", color: "#c9a96e", backdropFilter: "blur(6px)" }}>
                {p.template_name || "Custom"}
              </div>
              {/* Duration badge */}
              <div style={{ position: "absolute", top: 8, right: 8, fontSize: "0.65rem", fontWeight: 700, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "0.2rem 0.5rem", color: "#f0ede8", backdropFilter: "blur(6px)" }}>
                {p.duration}s
              </div>
              {/* Hook overlay */}
              {p.hook && (
                <p style={{ position: "absolute", bottom: 8, left: 10, right: 10, margin: 0, fontSize: "0.82rem", fontWeight: 700, color: "#fff", lineHeight: 1.3, textShadow: "0 1px 6px rgba(0,0,0,0.9)" }}>
                  {p.hook.slice(0, 80)}
                </p>
              )}
            </div>

            {/* Info */}
            <div style={{ padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.65rem", color: "#5a5755", fontWeight: 500 }}>
                  {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span style={{ fontSize: "0.65rem", color: "#5a5755" }}>{p.voice}</span>
              </div>

              {p.caption && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#7a7672", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.caption}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.25rem" }}>
                {p.audio_url && (
                  <button
                    className="btn-ghost"
                    style={{ flex: 1, padding: "0.5rem 0.5rem", fontSize: "0.75rem", borderRadius: 8, fontFamily: "inherit" }}
                    onClick={() => {
                      if (playing === p.id) {
                        setPlaying(null);
                        document.getElementById(`audio-${p.id}`)?.pause();
                      } else {
                        setPlaying(p.id);
                        document.getElementById(`audio-${p.id}`)?.play();
                      }
                    }}
                  >
                    {playing === p.id ? "⏸ Pause" : "▶ Play"}
                  </button>
                )}
                {p.audio_url && (
                  <button
                    className="btn-ghost"
                    style={{ flex: 1, padding: "0.5rem 0.5rem", fontSize: "0.75rem", borderRadius: 8, fontFamily: "inherit" }}
                    onClick={() => downloadAudio(p)}
                  >
                    ↓ Audio
                  </button>
                )}
                <a
                  href={p.image_url}
                  download={`${p.hook?.slice(0, 20) || "project"}.jpg`}
                  className="btn-ghost"
                  style={{ flex: 1, padding: "0.5rem 0.5rem", fontSize: "0.75rem", borderRadius: 8, fontFamily: "inherit", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9490", border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.15s" }}
                >
                  ↓ Image
                </a>
              </div>

              {/* Copy row */}
              {(p.hook || p.hashtags) && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {p.hook && (
                    <button
                      className="btn-ghost"
                      style={{ flex: 1, padding: "0.4rem 0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit" }}
                      onClick={() => navigator.clipboard.writeText(p.hook)}
                    >
                      Copy Hook
                    </button>
                  )}
                  {p.hashtags && (
                    <button
                      className="btn-ghost"
                      style={{ flex: 1, padding: "0.4rem 0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit" }}
                      onClick={() => navigator.clipboard.writeText(p.hashtags)}
                    >
                      Copy Tags
                    </button>
                  )}
                </div>
              )}

              <button
                className="btn-ghost"
                style={{ padding: "0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }}
                onClick={() => deleteProject(p.id)}
                disabled={deleting === p.id}
              >
                {deleting === p.id ? "Deleting…" : "Delete"}
              </button>

              {p.audio_url && (
                <audio
                  id={`audio-${p.id}`}
                  src={p.audio_url}
                  onEnded={() => setPlaying(null)}
                  style={{ display: "none" }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
