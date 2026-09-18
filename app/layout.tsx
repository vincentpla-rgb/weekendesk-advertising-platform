import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Weekendesk Advertising',
  description: 'Calculadora de precios y presupuestos publicitarios de Weekendesk.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
