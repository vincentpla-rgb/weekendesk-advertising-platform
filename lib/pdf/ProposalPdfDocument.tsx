import { join } from 'node:path';

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

import type { ContentLanguage } from '@/lib/domain';
import { MARKET_LABELS } from '@/lib/format';
import { getPublicCopy, getVatNotice } from '@/lib/i18n';
import { formatMoney, formatPercent, formatDateLong } from '@/lib/email/weekendesk-shell';
import { getPdfInternalLabels } from './pdf-labels';
import type { PdfAudience, ProposalPdfData } from './proposal-pdf-data';

/**
 * Documento del PDF del presupuesto (CLAUDE.md §1/§9) — @react-pdf/renderer,
 * nunca un recálculo: toda cifra viene ya computada en `ProposalPdfData`
 * (`loadProposalPdfData`). Misma regla de nunca-cruzar-audiencias que el
 * resto del proyecto (CLAUDE.md §4.4/§6): la variante `client` nunca
 * incluye coste/margen, la variante `internal` sí.
 */

/**
 * Mismas etiquetas que `REACH_METRIC_LABELS` de
 * `app/p/[token]/PublicProposalClient.tsx` (sin exportar desde allí, se
 * mantienen aquí en paralelo) — para que el alcance se lea igual en la
 * pantalla pública y en el PDF. Español sin variantes por idioma, mismo
 * límite conocido y ya documentado que `MARKET_LABELS` (CLAUDE.md §9).
 */
const REACH_METRIC_LABELS: Record<string, string> = {
  PAGE_VIEWS: 'vistas de página',
  SESSIONS: 'sesiones',
  UNIQUE_USERS: 'usuarios únicos',
};

const PERIOD_UNIT_LABELS: Record<string, string> = {
  WEEK: 'semana',
  CAMPAIGN: 'campaña',
  SEND: 'envío',
  INSERTION_WEEK: 'semana de inserción',
  MONTH: 'mes',
  UNIT: 'unidad',
  COLLABORATION: 'colaboración',
};

const C = {
  fg1: '#1E1E1E',
  fg2: '#4F4F4F',
  fg3: '#888888',
  bd: '#D1D1D1',
  bd2: '#E7E7E7',
  red: '#F8443A',
  navy: '#001C4D',
  bg2: '#F6F6F6',
} as const;

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontFamily: 'Inter', fontSize: 10, color: C.fg1 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logo: { width: 110, height: 26, objectFit: 'contain' },
  title: { fontFamily: 'Host Grotesk', fontSize: 18, fontWeight: 700, color: C.navy },
  subtitle: { fontSize: 10, color: C.fg3, marginTop: 2 },
  metaBox: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.bd2 },
  metaRow: { flexDirection: 'row', marginBottom: 3 },
  metaLabel: { width: 130, color: C.fg3 },
  metaValue: { flex: 1, color: C.fg1 },
  sectionHeading: { fontFamily: 'Host Grotesk', fontSize: 12, fontWeight: 600, color: C.navy, marginBottom: 6 },
  briefText: { fontSize: 10, color: C.fg2, marginBottom: 2, lineHeight: 1.4 },
  optionCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.bd2,
    borderRadius: 4,
    padding: 12,
  },
  optionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  optionName: { fontFamily: 'Host Grotesk', fontSize: 13, fontWeight: 600, color: C.fg1 },
  optionMeta: { fontSize: 9, color: C.fg3, marginTop: 2 },
  optionPitch: { fontSize: 9.5, color: C.fg2, marginTop: 4, marginBottom: 6, lineHeight: 1.4 },
  table: { marginTop: 6, borderTopWidth: 1, borderTopColor: C.bd2 },
  tableHeadRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.bd },
  tableRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: C.bd2 },
  tableHeadCell: { fontSize: 8.5, color: C.fg3, fontWeight: 600 },
  tableCell: { fontSize: 9.5, color: C.fg1 },
  colSupport: { flex: 3 },
  colMarket: { flex: 1 },
  colQty: { flex: 1, textAlign: 'right' },
  colAmount: { flex: 1.3, textAlign: 'right' },
  reachNote: { fontSize: 8, color: C.fg3, marginTop: 2 },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 10 },
  totalBlock: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 8.5, color: C.fg3 },
  totalValue: { fontSize: 12, fontFamily: 'Host Grotesk', fontWeight: 700, color: C.navy },
  marginValue: { fontSize: 11, fontFamily: 'Host Grotesk', fontWeight: 600, color: C.fg1 },
  acceptanceBox: { marginTop: 4, marginBottom: 16, backgroundColor: C.bg2, borderRadius: 4, padding: 12 },
  vatNotice: { fontSize: 8, color: C.fg3, marginTop: 10, lineHeight: 1.4 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: C.fg3,
    borderTopWidth: 1,
    borderTopColor: C.bd2,
    paddingTop: 8,
  },
});

function periodLabel(
  option: ProposalPdfData['options'][number],
  language: ContentLanguage,
): string {
  const copy = getPublicCopy(language);
  if (option.campaignStart && option.campaignEnd) {
    return `${formatDateLong(new Date(option.campaignStart), language)} – ${formatDateLong(new Date(option.campaignEnd), language)}`;
  }
  if (option.campaignDurationCount && option.campaignDurationUnit) {
    return copy.duration(option.campaignDurationCount, option.campaignDurationUnit);
  }
  return '—';
}

export function ProposalPdfDocument({
  data,
  audience,
}: {
  data: ProposalPdfData;
  audience: PdfAudience;
}) {
  const language = data.language;
  const copy = getPublicCopy(language);
  const internalLabels = getPdfInternalLabels(audience === 'internal' ? 'ES' : language);
  const isInternal = audience === 'internal';
  const showVatNotice = isInternal === false && data.acceptance?.vatRegime === 'REVERSE_CHARGE' && language === 'ES';

  return (
    <Document title={`${internalLabels.title} ${data.proposalNumber} — ${data.advertiserLegalName}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow} fixed>
          {/*
            eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer no soporta alt.
            Copia del logo en `assets/images/` (no `public/`, CLAUDE.md §2): el
            logo que usa la web vive en `public/`, que Vercel sirve como
            estático pero no garantiza presente en el sistema de ficheros de
            una función serverless — `assets/` (igual que las fuentes,
            `lib/pdf/fonts.ts`) sí se traza explícitamente para esta función
            (`next.config.*`, `outputFileTracingIncludes`).
          */}
          <Image style={styles.logo} src={join(process.cwd(), 'assets', 'images', 'LOGO_Weekendesk_color.png')} />
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.title}>
              {internalLabels.title} {data.proposalNumber}
            </Text>
            <Text style={styles.subtitle}>{data.advertiserLegalName}</Text>
          </View>
        </View>

        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>{internalLabels.advertiser}</Text>
            <Text style={styles.metaValue}>{data.advertiserLegalName}</Text>
          </View>
          {data.contactFullName && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{internalLabels.contact}</Text>
              <Text style={styles.metaValue}>{data.contactFullName}</Text>
            </View>
          )}
          {isInternal && data.ownerFullName && (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{internalLabels.owner}</Text>
              <Text style={styles.metaValue}>{data.ownerFullName}</Text>
            </View>
          )}
        </View>

        {data.brief && data.brief.trim() !== '' && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.sectionHeading}>{copy.brief}</Text>
            {data.brief.split('\n').map((line, idx) => (
              <Text key={idx} style={styles.briefText}>
                {line.trim() === '' ? ' ' : line}
              </Text>
            ))}
          </View>
        )}

        {data.options.map((option) => {
          const marketLabels = option.markets.map((m) => MARKET_LABELS[m] ?? m).join(' · ');
          return (
            <View key={option.code} style={styles.optionCard} wrap={false}>
              <View style={styles.optionHeaderRow}>
                <View>
                  <Text style={styles.optionName}>
                    {internalLabels.option} {option.code}
                    {option.name ? ` — ${option.name}` : ''}
                  </Text>
                  <Text style={styles.optionMeta}>
                    {marketLabels} · {periodLabel(option, language)}
                  </Text>
                </View>
              </View>

              {option.pitch && <Text style={styles.optionPitch}>{option.pitch}</Text>}

              <View style={styles.table}>
                <View style={styles.tableHeadRow}>
                  <Text style={[styles.tableHeadCell, styles.colSupport]}>{internalLabels.support}</Text>
                  <Text style={[styles.tableHeadCell, styles.colMarket]}>{internalLabels.market}</Text>
                  <Text style={[styles.tableHeadCell, styles.colQty]}>{internalLabels.quantity}</Text>
                  <Text style={[styles.tableHeadCell, styles.colAmount]}>{internalLabels.billedTotal}</Text>
                </View>
                {option.lines.map((line, idx) => (
                  <View key={`${line.supportId}-${line.market}-${idx}`} style={styles.tableRow}>
                    <View style={styles.colSupport}>
                      <Text style={styles.tableCell}>{line.supportName}</Text>
                      {line.reach && (
                        <Text style={styles.reachNote}>
                          {internalLabels.reach}: {line.reach.value.toLocaleString(language.toLowerCase())}{' '}
                          {REACH_METRIC_LABELS[line.reach.metric] ?? line.reach.metric}/
                          {PERIOD_UNIT_LABELS[line.reach.periodUnit] ?? line.reach.periodUnit} — {line.reach.source}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.tableCell, styles.colMarket]}>{MARKET_LABELS[line.market] ?? line.market}</Text>
                    <Text style={[styles.tableCell, styles.colQty]}>{line.quantity}</Text>
                    <Text style={[styles.tableCell, styles.colAmount]}>{formatMoney(line.billedTotalCents, language)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.totalsRow}>
                {isInternal && option.costCents !== null && (
                  <View style={styles.totalBlock}>
                    <Text style={styles.totalLabel}>{internalLabels.cost}</Text>
                    <Text style={styles.marginValue}>{formatMoney(option.costCents, language)}</Text>
                  </View>
                )}
                {isInternal && (
                  <View style={styles.totalBlock}>
                    <Text style={styles.totalLabel}>{internalLabels.marginRate}</Text>
                    <Text style={styles.marginValue}>
                      {option.marginRate === null ? internalLabels.marginNotApplicable : formatPercent(option.marginRate, language)}
                    </Text>
                  </View>
                )}
                <View style={styles.totalBlock}>
                  <Text style={styles.totalLabel}>{internalLabels.optionTotal}</Text>
                  <Text style={styles.totalValue}>{formatMoney(option.billedTotalCents, language)}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {data.acceptance && (
          <View style={styles.acceptanceBox}>
            <Text style={styles.sectionHeading}>{internalLabels.acceptance}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{internalLabels.legalName}</Text>
              <Text style={styles.metaValue}>{data.acceptance.legalName}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{internalLabels.billingAddress}</Text>
              <Text style={styles.metaValue}>{data.acceptance.billingAddress}</Text>
            </View>
            {data.acceptance.vatNumber && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{internalLabels.vatNumber}</Text>
                <Text style={styles.metaValue}>{data.acceptance.vatNumber}</Text>
              </View>
            )}
            {data.acceptance.purchaseOrderReference && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{internalLabels.purchaseOrderReference}</Text>
                <Text style={styles.metaValue}>{data.acceptance.purchaseOrderReference}</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{internalLabels.vatRegime}</Text>
              <Text style={styles.metaValue}>
                {data.acceptance.vatRegime === 'FR_VAT_20' ? internalLabels.vatRegimeFr : internalLabels.vatRegimeReverseCharge}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>{internalLabels.acceptedAt}</Text>
              <Text style={styles.metaValue}>{formatDateLong(new Date(data.acceptance.acceptedAt), language)}</Text>
            </View>
            {showVatNotice && <Text style={styles.vatNotice}>{getVatNotice(language) ?? ''}</Text>}
          </View>
        )}

        <Text style={styles.footer} fixed>
          {internalLabels.footer}
        </Text>
      </Page>
    </Document>
  );
}
