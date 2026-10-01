import { redirect } from 'next/navigation';

// Pantalla de entrada (CLAUDE.md §10.1.1, ronda 21): el dashboard, no el
// creador de presupuestos directamente — mismo criterio que el login
// (`app/login/page.tsx`) y la cabecera interna desde la ronda 20.
export default function RootPage() {
  redirect('/dashboard');
}
