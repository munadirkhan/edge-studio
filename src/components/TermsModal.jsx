export function TermsModal({ onClose }) {
  return <LegalModal title="Terms of Service" onClose={onClose}>
    <Section title="1. Acceptance">
      By using EdgeStudio you agree to these terms. If you do not agree, do not use the service.
    </Section>
    <Section title="2. Use of Service">
      EdgeStudio is a tool for creating short-form video content. You may only process videos you own or have explicit rights to use. You are solely responsible for ensuring you have the necessary rights to any content you upload or process.
    </Section>
    <Section title="3. Content Rights">
      You retain ownership of your original content. By using EdgeStudio you grant us a limited license to process your content solely for the purpose of providing the service. We do not claim ownership of your clips or videos.
    </Section>
    <Section title="4. Copyright Compliance">
      You must not use EdgeStudio to infringe on the intellectual property rights of others. Processing copyrighted content without permission may violate platform policies (YouTube, TikTok, Instagram) and applicable law. EdgeStudio is not responsible for copyright claims arising from your use.
    </Section>
    <Section title="5. Prohibited Use">
      You may not use EdgeStudio to create content that is illegal, harmful, hateful, defamatory, or violates any third-party rights.
    </Section>
    <Section title="6. Service Availability">
      We provide this service on an "as is" basis. We may modify, suspend, or discontinue the service at any time without notice.
    </Section>
    <Section title="7. Limitation of Liability">
      EdgeStudio and its creators are not liable for any damages arising from your use of the service, including but not limited to copyright claims, data loss, or service interruptions.
    </Section>
    <Section title="8. Changes">
      We may update these terms at any time. Continued use of the service constitutes acceptance of the updated terms.
    </Section>
  </LegalModal>;
}

export function PrivacyModal({ onClose }) {
  return <LegalModal title="Privacy Policy" onClose={onClose}>
    <Section title="1. What We Collect">
      When you sign in, we collect your email address and basic profile information from your auth provider (Google or email). We also store metadata about jobs you run (YouTube URLs, clip results) linked to your account.
    </Section>
    <Section title="2. What We Don't Collect">
      We do not sell your data. We do not store your video files permanently — processed clips are temporarily stored and may be deleted after a period of time.
    </Section>
    <Section title="3. How We Use Your Data">
      Your data is used solely to provide the EdgeStudio service: displaying your past jobs, saving your clips, and authenticating your account.
    </Section>
    <Section title="4. Third-Party Services">
      EdgeStudio uses OpenAI APIs for transcription and AI features, Supabase for authentication and data storage, and Railway for server infrastructure. Each has their own privacy policies.
    </Section>
    <Section title="5. Data Security">
      We use industry-standard security practices. Your authentication is handled by Supabase, which is SOC 2 compliant.
    </Section>
    <Section title="6. Guest Usage">
      If you use EdgeStudio as a guest, no account data is stored. Processed clips are temporary and not saved to any account.
    </Section>
    <Section title="7. Contact">
      For privacy concerns, contact us through the feedback form in the app.
    </Section>
  </LegalModal>;
}

function LegalModal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", position: "relative" }}>
        <div style={{ padding: "1.5rem 1.5rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#f0ede8" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4a4745", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "1.25rem 1.5rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p style={{ margin: "0 0 0.35rem", fontSize: "0.75rem", fontWeight: 700, color: "#a09888" }}>{title}</p>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "#5a5755", lineHeight: 1.65 }}>{children}</p>
    </div>
  );
}
