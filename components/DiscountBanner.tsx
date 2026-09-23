'use client';

import { formatCents, formatPercent } from '@/lib/format';
import { useI18n } from '@/lib/i18n-internal';

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
  const { t } = useI18n();
  const floorBit = nominalCents !== effectiveCents;

  if (nominalCents === 0) {
    return (
      <div className="wk-discount-banner" style={{ background: 'var(--wk-bg)', color: 'var(--wk-text-muted)' }}>
        <span style={{ fontSize: 13 }}>{t('discountBanner.none')}</span>
      </div>
    );
  }

  return (
    <div className="wk-discount-banner">
      <div className="wk-discount-figure">
        {formatPercent(nominalRate)}
        <small>{t('discountBanner.nominal')} ({formatCents(nominalCents)})</small>
      </div>
      <div className="wk-discount-figure">
        {formatPercent(effectiveRate)}
        <small>{t('discountBanner.effective')} ({formatCents(effectiveCents)})</small>
      </div>
      {floorBit && (
        <span className="wk-badge wk-badge-warning" style={{ alignSelf: 'center' }}>
          {t('discountBanner.floorAbsorbs', { amount: formatCents(nominalCents - effectiveCents) })}
        </span>
      )}
    </div>
  );
}
