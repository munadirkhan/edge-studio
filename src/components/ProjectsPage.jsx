import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";

function ProjectSkeleton() {
  return (
    <div className="glass-card" style={{ overflow: "hidden" }}>
      <div className="skeleton" style={{ aspectRatio: "9/16", maxHeight: 220 }} />
      <div style={{ padding: "0.85rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <div className="skeleton" style={{ height: 12, width: "40%" }} />
        <div className="skeleton" style={{ height: 12, width: "90%" }} />
        <div className="skeleton" style={{ height: 12, width: "70%" }} />
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <div className="skeleton" style={{ height: 32, flex: 1 }} />
          <div className="skeleton" style={{ height: 32, flex: 1 }} />
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");
  const [deleting, setDeleting]         = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [playing, setPlaying]           = useState(null);

  useEffect(() => {
    if (user) fetchProjects();
  }, [user]);

  async function fetchProjects() {
    setLoading(true); setError("");
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      setProjects(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProject(id) {
    setDeleting(id);
    try {
      const project = projects.find(p => p.id === id);
      if (project) {
        await supabase.storage.from("project-assets").remove([
          `${user.id}/${id}/thumb.jpg`,
          `${user.id}/${id}/audio.mp3`,
        ]);
      }
      await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
      setProjects(p => p.filter(p => p.id !== id));
    } finally {
      setDeleting(null);
      setConfirmingDelete(null);
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: "1rem", textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", opacity: 0.15 }}>▦</div>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>Sign in to view your projects</p>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#6e6a66", maxWidth: 340 }}>
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
            {loading ? "Loading…" : `${projects.length} saved · generate on phone, download on PC`}
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

      {/* Skeleton loading */}
      {loading && !projects.length && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          <ProjectSkeleton />
          <ProjectSkeleton />
          <ProjectSkeleton />
        </div>
      )}

      {/* Empty state */}
      {!loading && !projects.length && !error && (
        <div className="glass-card" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem", opacity: 0.12 }}>▦</div>
          <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "1rem" }}>No saved projects yet</p>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#6e6a66", maxWidth: 300, marginInline: "auto" }}>
            After generating a video, hit "Save to Account" to store it here and access it on any device.
          </p>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
          {projects.map(p => (
            <div key={p.id} className="glass-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* Thumbnail */}
              <div style={{ position: "relative", background: "#0a0a0f", aspectRatio: "9/16", maxHeight: 220, overflow: "hidden" }}>
                <img
                  src={p.image_url}
                  alt={p.hook || "Project"}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)" }} />
                <div style={{ position: "absolute", top: 8, left: 8, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "0.2rem 0.5rem", color: "#c9a96e", backdropFilter: "blur(6px)" }}>
                  {p.template_name || "Custom"}
                </div>
                <div style={{ position: "absolute", top: 8, right: 8, fontSize: "0.65rem", fontWeight: 700, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "0.2rem 0.5rem", color: "#f0ede8", backdropFilter: "blur(6px)" }}>
                  {p.duration}s
                </div>
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

                {/* Download actions */}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "auto", paddingTop: "0.25rem" }}>
                  {p.audio_url && (
                    <button
                      className="btn-ghost"
                      style={{ flex: 1, padding: "0.5rem", fontSize: "0.75rem", borderRadius: 8, fontFamily: "inherit" }}
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
                      style={{ flex: 1, padding: "0.5rem", fontSize: "0.75rem", borderRadius: 8, fontFamily: "inherit" }}
                      onClick={() => downloadAudio(p)}
                    >
                      ↓ Audio
                    </button>
                  )}
                  <a
                    href={p.image_url}
                    download={`${p.hook?.slice(0, 20) || "project"}.jpg`}
                    className="btn-ghost"
                    style={{ flex: 1, padding: "0.5rem", fontSize: "0.75rem", borderRadius: 8, fontFamily: "inherit", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "#9a9490", border: "1px solid var(--border)", background: "rgba(255,255,255,0.04)", cursor: "pointer", transition: "all 0.15s" }}
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
                        style={{ flex: 1, padding: "0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit" }}
                        onClick={() => navigator.clipboard.writeText(p.hook)}
                      >
                        Copy Hook
                      </button>
                    )}
                    {p.hashtags && (
                      <button
                        className="btn-ghost"
                        style={{ flex: 1, padding: "0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit" }}
                        onClick={() => navigator.clipboard.writeText(p.hashtags)}
                      >
                        Copy Tags
                      </button>
                    )}
                  </div>
                )}

                {/* Inline delete confirmation */}
                {confirmingDelete === p.id ? (
                  <div className="delete-confirm-row">
                    <button
                      className="btn-danger-ghost"
                      style={{ flex: 1 }}
                      onClick={() => deleteProject(p.id)}
                      disabled={deleting === p.id}
                    >
                      {deleting === p.id ? "Deleting…" : "✕ Confirm delete"}
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ flex: 1, padding: "0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit" }}
                      onClick={() => setConfirmingDelete(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn-ghost"
                    style={{ padding: "0.4rem", fontSize: "0.68rem", borderRadius: 7, fontFamily: "inherit", color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }}
                    onClick={() => setConfirmingDelete(p.id)}
                    disabled={deleting === p.id}
                  >
                    Delete
                  </button>
                )}

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
      )}
    </div>
  );
}
