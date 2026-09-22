import type { Metadata } from 'next';

import './globals.css';
import { InternalI18nProvider } from '@/lib/i18n-internal';

export const metadata: Metadata = {
  title: 'Weekendesk Advertising',
  description: 'Calculadora de precios y presupuestos publicitarios de Weekendesk.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <InternalI18nProvider>{children}</InternalI18nProvider>
      </body>
    </html>
  );
}
