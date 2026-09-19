export default function NoAutorizadoPage() {
  return (
    <div className="wk-shell" style={{ maxWidth: 420, marginTop: 80 }}>
      <div className="wk-card">
        <h1 style={{ fontSize: 20 }}>Acceso no autorizado</h1>
        <p style={{ color: 'var(--wk-text-muted)', fontSize: 14 }}>
          Tu email no está en la lista de acceso al equipo. Pide a Vincent que te añada
          en <code>allowed_emails</code>.
        </p>
        <a className="wk-btn wk-btn-secondary" href="/login" style={{ marginTop: 12 }}>
          Volver al login
        </a>
      </div>
    </div>
  );
}
