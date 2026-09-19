'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { loginWithPassword } from './actions';

/**
 * Login con email y contraseña (CLAUDE.md §2, §10.3). Sustituye al magic
 * link: el enlace se quedaba dos días sin funcionar en producción, consumido
 * antes de que la persona lo abriera por el rastreador de clics de
 * Resend/SES, un punto que no depende de este código ni se pudo desactivar
 * en el dominio de pruebas. El código del magic link (`/auth/callback`,
 * `/auth/confirm`, `lib/supabase/login-redirect.ts`, `lib/email/`) se deja
 * tal cual por si se recupera más adelante — solo se ha quitado de aquí.
 *
 * Sin registro público: los usuarios los da de alta un administrador desde
 * el dashboard de Supabase (Authentication > Users). Sin recuperación de
 * contraseña por email en esta versión — depender del correo para entrar es
 * el problema que este cambio resuelve, no algo a lo que volver por la
 * puerta de atrás.
 *
 * La lista blanca (`allowed_emails`) se sigue comprobando igual que antes,
 * solo que ahora en el mismo paso que la contraseña (`./actions.ts`,
 * `loginWithPassword`) en vez de al volver de un enlace: si el email no está
 * autorizado, la sesión que Supabase acaba de abrir se cierra ahí mismo y
 * aquí solo se muestra el motivo.
 */
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await loginWithPassword(email, password);

    if (!result.ok) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    const next = new URLSearchParams(window.location.search).get('next') ?? '/proposals/new';
    router.push(next);
    router.refresh();
  }

  return (
    <div className="wk-shell" style={{ maxWidth: 400, marginTop: 80 }}>
      <div className="wk-card">
        <h1 style={{ fontSize: 20 }}>Weekendesk Advertising</h1>
        <p style={{ color: 'var(--wk-text-muted)', fontSize: 13, marginBottom: 18 }}>
          Acceso solo para el equipo. Introduce tu email y contraseña de Weekendesk.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="wk-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="wk-input"
            placeholder="tu.nombre@weekendesk.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <label className="wk-label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="wk-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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
            disabled={submitting}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={{ color: 'var(--wk-text-muted)', fontSize: 12, marginTop: 16 }}>
          ¿No tienes cuenta? Pide a Vincent que te la cree.
        </p>
      </div>
    </div>
  );
}
