'use client';

import { formatCents, formatPercent } from '@/lib/format';

/**
 * El total de descuento acumulado, bien visible — confirmado por Vincent
 * (CLAUDE.md §4.5): no es un dato secundario en un desglose, porque el suelo
 * puede hacer que el descuento efectivo sea menor que el nominal sin que
 * salte ningún error. Se ve la diferencia entre lo ofrecido y lo concedido.
 */
export function DiscountBanner({
  nominalRate,
  nominalCents,
  effectiveRate,
  effectiveCents,
}: {
  nominalRate: number;
  nominalCents: number;
  effectiveRate: number;
  effectiveCents: number;
}) {
  const floorBit = nominalCents !== effectiveCents;

  if (nominalCents === 0) {
    return (
      <div className="wk-discount-banner" style={{ background: 'var(--wk-bg)', color: 'var(--wk-text-muted)' }}>
        <span style={{ fontSize: 13 }}>Sin descuento aplicado.</span>
      </div>
    );
  }

  return (
    <div className="wk-discount-banner">
      <div className="wk-discount-figure">
        {formatPercent(nominalRate)}
        <small>Descuento nominal ({formatCents(nominalCents)})</small>
      </div>
      <div className="wk-discount-figure">
        {formatPercent(effectiveRate)}
        <small>Descuento efectivo ({formatCents(effectiveCents)})</small>
      </div>
      {floorBit && (
        <span className="wk-badge wk-badge-warning" style={{ alignSelf: 'center' }}>
          El suelo de margen absorbe {formatCents(nominalCents - effectiveCents)}
        </span>
      )}
    </div>
  );
}
