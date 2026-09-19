'use client';

import { useState } from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Login con magic link (CLAUDE.md §2): sin contraseña, sin Google SSO. La
 * lista blanca (`allowed_emails`) no se comprueba aquí — comprobarla antes de
 * enviar el enlace revelaría qué emails están en la lista. Se comprueba al
 * volver del enlace, en /auth/confirm.
 *
 * El propio email lo manda Resend, no el SMTP de pruebas de Supabase (ver
 * app/api/auth/send-email/route.ts): `emailRedirectTo` aquí es el destino
 * final tras entrar, no una URL de Supabase — el "Send Email Hook" lo usa
 * para construir el enlace hacia /auth/confirm.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/proposals/new` },
    });

    if (authError) {
      setError(authError.message);
      setStatus('error');
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="wk-shell" style={{ maxWidth: 400, marginTop: 80 }}>
      <div className="wk-card">
        <h1 style={{ fontSize: 20 }}>Weekendesk Advertising</h1>
        <p style={{ color: 'var(--wk-text-muted)', fontSize: 13, marginBottom: 18 }}>
          Acceso solo para el equipo. Introduce tu email de Weekendesk y te enviamos un
          enlace de acceso.
        </p>

        {status === 'sent' ? (
          <div className="wk-alert wk-alert-info">
            Te hemos enviado un enlace a <strong>{email}</strong>. Ábrelo desde este
            mismo navegador.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="wk-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="wk-input"
              placeholder="tu.nombre@weekendesk.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            {error && (
              <div className="wk-alert wk-alert-danger" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              className="wk-btn wk-btn-primary"
              disabled={status === 'sending'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {status === 'sending' ? 'Enviando…' : 'Enviar enlace de acceso'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
