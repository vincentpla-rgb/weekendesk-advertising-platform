'use client';

import { useMemo, useState } from 'react';

import {
  MARKETS,
  buildCatalog,
  computeDurationUnits,
  euros,
  priceOption,
  runPreSendChecks,
  suggestedQuantity,
  toEuros,
  type DurationSupportUnit,
  type Market,
  type ManualDiscount,
  type OptionInput,
  type OptionLineInput,
  type PreSendOptionContext,
  type PricedOption,
  type PricingParameters,
  type PublicHoliday,
  type SupportDefinition,
} from '@/src/pricing/index.js';

import { CONTENT_LANGUAGES, LANGUAGE_LABELS, type AccountRow, type ContentLanguage } from '@/lib/domain';
import { COUNTRY_CODES, countryName } from '@/lib/countries';
import { MARKET_LABELS, formatCents, formatPercent } from '@/lib/format';
import { DiscountBanner } from '@/components/DiscountBanner';
import { PreSendChecklist } from '@/components/PreSendChecklist';
import { useI18n, type InternalLanguage } from '@/lib/i18n-internal';

let lineKeySeq = 0;
function nextKey() {
  lineKeySeq += 1;
  return `l${lineKeySeq}`;
}

interface LineDraft {
  readonly key: string;
  supportId: string;
  quantity: number;
  mediaBudgetEuros: number | '';
  mediaMonths: number | '';
}

interface DiscountDraft {
  readonly key: string;
  ratePercent: number | '';
  reason: string;
}

type ScheduleMode = 'DATES' | 'DURATION_ONLY';

interface OptionDraft {
  readonly key: string;
  code: 'A' | 'B' | 'C';
  name: string;
  pitch: string;
  /** Mercados de la opción, elegidos UNA VEZ (CLAUDE.md §4.2, ronda 2). */
  markets: Market[];
  scheduleMode: ScheduleMode;
  campaignStart: string;
  campaignEnd: string;
  durationCount: number | '';
  durationUnit: DurationSupportUnit;
  lines: LineDraft[];
  discounts: DiscountDraft[];
}

function emptyLine(supports: readonly SupportDefinition[]): LineDraft {
  return {
    key: nextKey(),
    supportId: supports[0]?.id ?? '',
    quantity: 1,
    mediaBudgetEuros: '',
    mediaMonths: '',
  };
}

function emptyOption(code: OptionDraft['code'], supports: readonly SupportDefinition[]): OptionDraft {
  return {
    key: nextKey(),
    code,
    name: '',
    pitch: '',
    markets: ['FR'],
    scheduleMode: 'DATES',
    campaignStart: '',
    campaignEnd: '',
    durationCount: '',
    durationUnit: 'WEEK',
    lines: [emptyLine(supports)],
    discounts: [],
  };
}

/** Idioma de interfaz (ES/FR/EN) → locale de Intl para `countryName` (CLAUDE.md §9, ronda 2). */
const UI_TO_INTL_LOCALE: Record<InternalLanguage, 'es' | 'fr' | 'en'> = { ES: 'es', FR: 'fr', EN: 'en' };

export function ProposalBuilder({
  parameters,
  supports,
  holidays,
  accounts,
}: {
  parameters: PricingParameters;
  supports: readonly SupportDefinition[];
  holidays: readonly PublicHoliday[];
  accounts: readonly AccountRow[];
}) {
  const { t, language: uiLanguage } = useI18n();
  const catalog = useMemo(() => buildCatalog(supports), [supports]);

  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? '__new__');
  const [newAccount, setNewAccount] = useState({ legal_name: '', country_code: 'FR' });
  const [contactId, setContactId] = useState<string>('__new__');
  const [newContact, setNewContact] = useState({ full_name: '', email: '' });
  const [language, setLanguage] = useState<ContentLanguage>('FR');
  const [brief, setBrief] = useState('');
  // Se empieza con una sola opción, sin pestañas visibles (CLAUDE.md §5.1,
  // ronda 4): las pestañas solo aparecen al añadir la segunda.
  const [options, setOptions] = useState<OptionDraft[]>(() => [emptyOption('A', supports)]);
  const [activeOptionKey, setActiveOptionKey] = useState<string>(() => options[0]!.key);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicToken: string } | null>(null);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  function updateOption(key: string, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  function toggleMarket(optionKey: string, market: Market) {
    setOptions((prev) =>
      prev.map((o) => {
        if (o.key !== optionKey) return o;
        const has = o.markets.includes(market);
        // No se permite dejar la opción sin ningún mercado.
        if (has && o.markets.length === 1) return o;
        const markets = has ? o.markets.filter((m) => m !== market) : [...o.markets, market];
        return { ...o, markets };
      }),
    );
  }

  function updateLine(optionKey: string, lineKey: string, patch: Partial<LineDraft>) {
    setOptions((prev) =>
      prev.map((o) =>
        o.key !== optionKey
          ? o
          : { ...o, lines: o.lines.map((l) => (l.key === lineKey ? { ...l, ...patch } : l)) },
      ),
    );
  }

  function addLine(optionKey: string) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionKey ? { ...o, lines: [...o.lines, emptyLine(supports)] } : o)),
    );
  }

  function removeLine(optionKey: string, lineKey: string) {
    setOptions((prev) =>
      prev.map((o) =>
        o.key !== optionKey ? o : { ...o, lines: o.lines.filter((l) => l.key !== lineKey) },
      ),
    );
  }

  function addDiscount(optionKey: string) {
    setOptions((prev) =>
      prev.map((o) =>
        o.key === optionKey
          ? { ...o, discounts: [...o.discounts, { key: nextKey(), ratePercent: '', reason: '' }] }
          : o,
      ),
    );
  }

  function updateDiscount(optionKey: string, discountKey: string, patch: Partial<DiscountDraft>) {
    setOptions((prev) =>
      prev.map((o) =>
        o.key !== optionKey
          ? o
          : {
              ...o,
              discounts: o.discounts.map((d) => (d.key === discountKey ? { ...d, ...patch } : d)),
            },
      ),
    );
  }

  function removeDiscount(optionKey: string, discountKey: string) {
    setOptions((prev) =>
      prev.map((o) =>
        o.key !== optionKey ? o : { ...o, discounts: o.discounts.filter((d) => d.key !== discountKey) },
      ),
    );
  }

  function addOption() {
    if (options.length >= 3) return;
    const nextCode = (['A', 'B', 'C'] as const)[options.length]!;
    const next = emptyOption(nextCode, supports);
    setOptions((prev) => [...prev, next]);
    // La opción recién añadida es la que el comercial quiere editar.
    setActiveOptionKey(next.key);
  }

  function removeOption(key: string) {
    if (options.length <= 1) return;
    const remaining = options.filter((o) => o.key !== key);
    setOptions(remaining);
    if (activeOptionKey === key) {
      setActiveOptionKey(remaining[0]!.key);
    }
  }

  // --- Cálculo en vivo, con el mismo motor puro que corre en el servidor ---
  // Es solo una vista previa: el servidor recalcula con este mismo motor a
  // partir de los datos crudos al enviar, y esos números (no estos) son los
  // que se persisten y se congelan.
  const draftToOptionInput = (draft: OptionDraft): OptionInput => ({
    id: draft.key,
    name: draft.name || undefined,
    markets: draft.markets,
    lines: draft.lines
      .filter((l) => l.supportId)
      .map((l): OptionLineInput => {
        const support = catalog.get(l.supportId);
        return {
          supportId: l.supportId,
          quantity: l.quantity,
          ...(support?.isMediaBuy
            ? {
                mediaBudgetCents: l.mediaBudgetEuros === '' ? 0 : euros(l.mediaBudgetEuros),
                mediaMonths: l.mediaMonths === '' ? 1 : l.mediaMonths,
              }
            : {}),
        };
      }),
    manualDiscounts: draft.discounts
      .filter((d) => d.ratePercent !== '' && d.reason.trim() !== '')
      .map((d): ManualDiscount => ({ rate: Number(d.ratePercent) / 100, reason: d.reason })),
  });

  let priced: (PricedOption & { error?: string })[] = [];
  try {
    priced = options.map((draft) => {
      try {
        return priceOption(draftToOptionInput(draft), { parameters, catalog });
      } catch (err) {
        return {
          id: draft.key,
          name: draft.name || null,
          lines: [],
          markets: [],
          grossNetOfMediaCents: 0,
          discounts: [],
          nominalDiscountRate: 0,
          nominalDiscountCents: 0,
          effectiveDiscountCents: 0,
          effectiveDiscountRate: 0,
          netRevenueCents: 0,
          mediaBudgetCents: 0,
          billedTotalCents: 0,
          costCents: 0,
          marginCents: 0,
          marginRate: null,
          meetsMarginFloor: false,
          maxLeadTimeBusinessDays: 0,
          warnings: [],
          error: err instanceof Error ? err.message : 'Línea inválida',
        };
      }
    });
  } catch {
    priced = [];
  }

  const preSendOptions: PreSendOptionContext[] = options.map((draft, idx) => ({
    option: priced[idx]!,
    campaignStart:
      draft.scheduleMode === 'DATES' && draft.campaignStart
        ? new Date(`${draft.campaignStart}T00:00:00Z`)
        : null,
    durationOnly: draft.scheduleMode === 'DURATION_ONLY',
  }));

  const preSend = runPreSendChecks(preSendOptions, {
    today: new Date(),
    brief,
    parameters,
    holidays,
  });

  const hasEngineErrors = priced.some((p) => 'error' in p && p.error);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId === '__new__' ? null : accountId,
          newAccount: accountId === '__new__' ? newAccount : null,
          contactId: contactId === '__new__' ? null : contactId,
          // El contacto nuevo hereda el idioma del selector "Idioma del
          // cliente": es el mismo que determina la pantalla pública y el
          // email de este envío (§5.6, ronda 2) — no un campo aparte que
          // pudiera quedarse desincronizado.
          newContact: contactId === '__new__' ? { ...newContact, language } : null,
          language,
          brief,
          options: options.map((o) => ({
            code: o.code,
            name: o.name,
            pitch: o.pitch,
            markets: o.markets,
            campaignStart: o.scheduleMode === 'DATES' ? o.campaignStart || null : null,
            campaignEnd: o.scheduleMode === 'DATES' ? o.campaignEnd || null : null,
            campaignDurationCount: o.scheduleMode === 'DURATION_ONLY' && o.durationCount !== '' ? o.durationCount : null,
            campaignDurationUnit: o.scheduleMode === 'DURATION_ONLY' && o.durationCount !== '' ? o.durationUnit : null,
            lines: o.lines
              .filter((l) => l.supportId)
              .map((l) => ({
                supportId: l.supportId,
                quantity: l.quantity,
                mediaBudgetEuros: l.mediaBudgetEuros === '' ? null : l.mediaBudgetEuros,
                mediaMonths: l.mediaMonths === '' ? null : l.mediaMonths,
              })),
            discounts: o.discounts
              .filter((d) => d.ratePercent !== '' && d.reason.trim() !== '')
              .map((d) => ({ ratePercent: d.ratePercent, reason: d.reason })),
          })),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? 'Error al crear el envío');
      }
      setResult({ publicToken: body.publicToken });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const publicUrl = `${window.location.origin}/p/${result.publicToken}`;
    const contactEmail =
      contactId !== '__new__'
        ? (selectedAccount?.contacts.find((c) => c.id === contactId)?.email ?? '')
        : newContact.email;

    return (
      <div className="wk-card" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h2>{t('proposalBuilder.sentTitle')}</h2>
        <p style={{ color: 'var(--wk-text-muted)' }}>
          {t('proposalBuilder.sentBody', { email: contactEmail })}
        </p>
        <div className="wk-input" style={{ marginBottom: 12, userSelect: 'all' }}>{publicUrl}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="wk-btn wk-btn-secondary" href={publicUrl} target="_blank" rel="noreferrer">
            {t('proposalBuilder.viewPublic')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1>{t('proposalBuilder.title')}</h1>

      <section className="wk-card">
        <h3>{t('proposalBuilder.accountAndContact')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label className="wk-label">{t('proposalBuilder.account')}</label>
            <select
              className="wk-select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setContactId('__new__');
              }}
            >
              <option value="__new__">{t('proposalBuilder.newAccount')}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.legal_name}
                </option>
              ))}
            </select>
            {accountId === '__new__' && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="wk-input"
                  placeholder={t('proposalBuilder.legalName')}
                  value={newAccount.legal_name}
                  onChange={(e) => setNewAccount({ ...newAccount, legal_name: e.target.value })}
                />
                <select
                  className="wk-select"
                  aria-label={t('proposalBuilder.country')}
                  value={newAccount.country_code}
                  onChange={(e) => setNewAccount({ ...newAccount, country_code: e.target.value })}
                >
                  {COUNTRY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {countryName(code, UI_TO_INTL_LOCALE[uiLanguage])}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="wk-label">{t('proposalBuilder.contact')}</label>
            <select
              className="wk-select"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              <option value="__new__">{t('proposalBuilder.newContact')}</option>
              {selectedAccount?.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} ({c.email})
                </option>
              ))}
            </select>
            {contactId === '__new__' && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  className="wk-input"
                  placeholder={t('proposalBuilder.contactFullName')}
                  value={newContact.full_name}
                  onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })}
                />
                <input
                  className="wk-input"
                  placeholder={t('proposalBuilder.contactEmail')}
                  type="email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="wk-card">
        <h3>{t('proposalBuilder.shipment')}</h3>
        <div style={{ maxWidth: 320, marginBottom: 12 }}>
          <label className="wk-label">{t('proposalBuilder.clientLanguage')}</label>
          <select
            className="wk-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as ContentLanguage)}
          >
            {CONTENT_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_LABELS[l]}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: 'var(--wk-text-muted)', margin: '4px 0 0' }}>
            {t('proposalBuilder.clientLanguageHelp')}
          </p>
        </div>
        <label className="wk-label">{t('proposalBuilder.brief')}</label>
        <textarea
          className="wk-textarea"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={t('proposalBuilder.briefPlaceholder')}
        />
      </section>

      {/*
        Pestañas por opción (CLAUDE.md §5.1, ronda 4): con una sola opción no
        se muestran — nada que comparar todavía. Desde la segunda, cada
        pestaña dobla como resumen fijo (precio + margen), así que la
        comparación entre opciones no se pierde por estar dentro de otra.
      */}
      {options.length > 1 && (
        <div className="wk-option-tabs">
          {options.map((draft, idx) => (
            <OptionSummaryTab
              key={draft.key}
              label={`${t('proposalBuilder.option')} ${draft.code}${draft.name ? ` — ${draft.name}` : ''}`}
              priced={priced[idx] ?? null}
              active={draft.key === activeOptionKey}
              onClick={() => setActiveOptionKey(draft.key)}
            />
          ))}
        </div>
      )}

      {options.map((draft, idx) => {
        if (options.length > 1 && draft.key !== activeOptionKey) return null;
        const p = priced[idx];
        return (
          <OptionEditor
            key={draft.key}
            draft={draft}
            priced={p ?? null}
            supports={supports}
            catalog={catalog}
            onUpdate={(patch) => updateOption(draft.key, patch)}
            onToggleMarket={(m) => toggleMarket(draft.key, m)}
            onUpdateLine={(lineKey, patch) => updateLine(draft.key, lineKey, patch)}
            onAddLine={() => addLine(draft.key)}
            onRemoveLine={(lineKey) => removeLine(draft.key, lineKey)}
            onAddDiscount={() => addDiscount(draft.key)}
            onUpdateDiscount={(dKey, patch) => updateDiscount(draft.key, dKey, patch)}
            onRemoveDiscount={(dKey) => removeDiscount(draft.key, dKey)}
            onRemoveOption={options.length > 1 ? () => removeOption(draft.key) : null}
          />
        );
      })}

      {options.length < 3 && (
        <button type="button" className="wk-btn wk-btn-secondary" onClick={addOption} style={{ alignSelf: 'flex-start' }}>
          {t('proposalBuilder.addOption')}
        </button>
      )}
      {options.length < 2 && (
        <p style={{ fontSize: 12, color: 'var(--wk-text-muted)', margin: 0 }}>
          {t('proposalBuilder.needsSecondOption')}
        </p>
      )}

      <section className="wk-card">
        <h3>{t('proposalBuilder.preSendChecks')}</h3>
        <PreSendChecklist blockers={preSend.blockers} warnings={preSend.warnings} />
      </section>

      {submitError && <div className="wk-alert wk-alert-danger">{submitError}</div>}

      <button
        type="button"
        className="wk-btn wk-btn-primary"
        disabled={!preSend.canSend || hasEngineErrors || submitting || options.length < 2}
        onClick={handleSubmit}
        style={{ alignSelf: 'flex-start', fontSize: 15, padding: '12px 24px' }}
      >
        {submitting ? t('proposalBuilder.sending') : t('proposalBuilder.send')}
      </button>
    </div>
  );
}

/**
 * Pestaña de opción: además de cambiar de opción activa, hace de resumen
 * fijo de precio y margen (CLAUDE.md §5.1, ronda 4) — visible mientras se
 * está dentro de otra pestaña, para no perder la comparación de un vistazo.
 */
function OptionSummaryTab({
  label,
  priced,
  active,
  onClick,
}: {
  label: string;
  priced: (PricedOption & { error?: string }) | null;
  active: boolean;
  onClick: () => void;
}) {
  const hasError = priced && 'error' in priced && priced.error;
  return (
    <button
      type="button"
      className={`wk-option-tab${active ? ' wk-option-tab-active' : ''}`}
      onClick={onClick}
    >
      <span className="wk-option-tab-name">{label}</span>
      {priced && !hasError ? (
        <>
          <span className="wk-option-tab-price">{formatCents(priced.billedTotalCents)}</span>
          <span
            className={`wk-badge ${priced.meetsMarginFloor ? 'wk-badge-success' : 'wk-badge-danger'}`}
          >
            {priced.marginRate === null ? '—' : formatPercent(priced.marginRate)}
          </span>
        </>
      ) : (
        <span className="wk-badge wk-badge-danger">!</span>
      )}
    </button>
  );
}

function OptionEditor({
  draft,
  priced,
  supports,
  catalog,
  onUpdate,
  onToggleMarket,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  onAddDiscount,
  onUpdateDiscount,
  onRemoveDiscount,
  onRemoveOption,
}: {
  draft: OptionDraft;
  priced: (PricedOption & { error?: string }) | null;
  supports: readonly SupportDefinition[];
  catalog: ReturnType<typeof buildCatalog>;
  onUpdate: (patch: Partial<OptionDraft>) => void;
  onToggleMarket: (market: Market) => void;
  onUpdateLine: (lineKey: string, patch: Partial<LineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineKey: string) => void;
  onAddDiscount: () => void;
  onUpdateDiscount: (discountKey: string, patch: Partial<DiscountDraft>) => void;
  onRemoveDiscount: (discountKey: string) => void;
  onRemoveOption: (() => void) | null;
}) {
  const { t } = useI18n();

  // La MISMA conversión que alimenta la cantidad del motor (CLAUDE.md §5.3,
  // ronda 2): nunca una fórmula "de mostrar" distinta de la "de calcular".
  const duration: { count: number; unit: DurationSupportUnit; units: ReturnType<typeof computeDurationUnits> | null } | null =
    (() => {
      if (draft.scheduleMode === 'DURATION_ONLY') {
        return draft.durationCount === ''
          ? null
          : { count: draft.durationCount, unit: draft.durationUnit, units: null };
      }
      if (!draft.campaignStart || !draft.campaignEnd) return null;
      try {
        const units = computeDurationUnits(
          new Date(`${draft.campaignStart}T00:00:00Z`),
          new Date(`${draft.campaignEnd}T00:00:00Z`),
        );
        return { count: draft.durationUnit === 'WEEK' ? units.weeks : units.months, unit: draft.durationUnit, units };
      } catch {
        return null;
      }
    })();

  function applyDurationToLine(lineKey: string, unit: DurationSupportUnit) {
    if (draft.scheduleMode === 'DURATION_ONLY') {
      if (draft.durationCount === '' || draft.durationUnit !== unit) return;
      onUpdateLine(lineKey, { quantity: draft.durationCount });
      return;
    }
    if (!draft.campaignStart || !draft.campaignEnd) return;
    const units = computeDurationUnits(
      new Date(`${draft.campaignStart}T00:00:00Z`),
      new Date(`${draft.campaignEnd}T00:00:00Z`),
    );
    onUpdateLine(lineKey, { quantity: suggestedQuantity(units, unit) });
  }

  return (
    <div className="wk-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>{t('proposalBuilder.option')} {draft.code}</h3>
        {onRemoveOption && (
          <button type="button" className="wk-btn wk-btn-ghost" onClick={onRemoveOption}>
            {t('proposalBuilder.remove')}
          </button>
        )}
      </div>

      <input
        className="wk-input"
        placeholder={t('proposalBuilder.optionName')}
        value={draft.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        style={{ marginBottom: 8 }}
      />
      <textarea
        className="wk-textarea"
        placeholder={t('proposalBuilder.optionPitch')}
        value={draft.pitch}
        onChange={(e) => onUpdate({ pitch: e.target.value })}
        style={{ minHeight: 50, marginBottom: 12 }}
      />

      <label className="wk-label">{t('proposalBuilder.markets')}</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        {MARKETS.map((m) => (
          <label
            key={m}
            className="wk-badge"
            style={{
              cursor: 'pointer',
              background: draft.markets.includes(m) ? 'var(--wk-navy)' : 'var(--wk-bg)',
              color: draft.markets.includes(m) ? '#fff' : 'var(--wk-text-muted)',
            }}
          >
            <input
              type="checkbox"
              checked={draft.markets.includes(m)}
              onChange={() => onToggleMarket(m)}
              style={{ display: 'none' }}
            />
            {MARKET_LABELS[m]}
          </label>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--wk-text-muted)', margin: '0 0 14px' }}>
        {t('proposalBuilder.marketsHelp')}
      </p>

      <label className="wk-label">{t('proposalBuilder.scheduleMode')}</label>
      <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="radio"
            checked={draft.scheduleMode === 'DATES'}
            onChange={() => onUpdate({ scheduleMode: 'DATES' })}
          />
          {t('proposalBuilder.scheduleDates')}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="radio"
            checked={draft.scheduleMode === 'DURATION_ONLY'}
            onChange={() => onUpdate({ scheduleMode: 'DURATION_ONLY' })}
          />
          {t('proposalBuilder.scheduleDurationOnly')}
        </label>
      </div>

      {draft.scheduleMode === 'DATES' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
          <div>
            <label className="wk-label">{t('proposalBuilder.campaignStart')}</label>
            <input
              className="wk-input"
              type="date"
              value={draft.campaignStart}
              onChange={(e) => onUpdate({ campaignStart: e.target.value })}
            />
          </div>
          <div>
            <label className="wk-label">{t('proposalBuilder.campaignEnd')}</label>
            <input
              className="wk-input"
              type="date"
              value={draft.campaignEnd}
              onChange={(e) => onUpdate({ campaignEnd: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 4 }}>
          <div>
            <label className="wk-label">{t('proposalBuilder.durationCount')}</label>
            <input
              className="wk-input"
              type="number"
              min={1}
              style={{ width: 90 }}
              value={draft.durationCount}
              onChange={(e) =>
                onUpdate({ durationCount: e.target.value === '' ? '' : Number(e.target.value) })
              }
            />
          </div>
          <select
            className="wk-select"
            style={{ width: 140 }}
            value={draft.durationUnit}
            onChange={(e) => onUpdate({ durationUnit: e.target.value as DurationSupportUnit })}
          >
            <option value="WEEK">{t('proposalBuilder.durationUnitWeek')}</option>
            <option value="MONTH">{t('proposalBuilder.durationUnitMonth')}</option>
          </select>
        </div>
      )}

      {duration && (
        <p style={{ fontSize: 12, color: 'var(--wk-navy)', margin: '2px 0 4px', fontWeight: 600 }}>
          {duration.units
            ? `${duration.units.weeks} ${t('proposalBuilder.durationUnitWeek')} (${duration.units.months} ${t('proposalBuilder.durationUnitMonth')})`
            : `${duration.count} ${duration.unit === 'WEEK' ? t('proposalBuilder.durationUnitWeek') : t('proposalBuilder.durationUnitMonth')}`}
        </p>
      )}
      {draft.scheduleMode === 'DURATION_ONLY' && (
        <div className="wk-alert wk-alert-warning" style={{ marginBottom: 12, fontSize: 12, padding: '8px 12px' }}>
          {t('proposalBuilder.durationOnlyWarning')}
        </div>
      )}

      <table className="wk-table">
        <thead>
          <tr>
            <th>{t('proposalBuilder.support')}</th>
            <th>{t('proposalBuilder.quantity')}</th>
            <th>{t('proposalBuilder.media')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line) => {
            const support = catalog.get(line.supportId);
            const notSellableIn = draft.markets.filter(
              (m) => priced?.lines.find((l) => l.supportId === line.supportId && l.market === m && !l.sellable),
            );
            const canApplyDuration =
              support && (support.unit === 'WEEK' || support.unit === 'MONTH') && duration !== null;
            return (
              <tr key={line.key}>
                <td>
                  <select
                    className="wk-select"
                    value={line.supportId}
                    onChange={(e) => onUpdateLine(line.key, { supportId: e.target.value })}
                  >
                    {supports.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} — {s.name}
                      </option>
                    ))}
                  </select>
                  {support?.requiresAvailabilityCheck && (
                    <div className="wk-badge wk-badge-neutral" style={{ marginTop: 4 }}>
                      {t('proposalBuilder.availabilityNotice')}
                    </div>
                  )}
                  {notSellableIn.length > 0 && (
                    <div className="wk-badge wk-badge-danger" style={{ marginTop: 4 }}>
                      {t('proposalBuilder.notSellableIn')} {notSellableIn.map((m) => MARKET_LABELS[m]).join(', ')}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      className="wk-input"
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={line.quantity}
                      onChange={(e) => onUpdateLine(line.key, { quantity: Number(e.target.value) })}
                      style={{ width: 68 }}
                    />
                    {canApplyDuration && (
                      <button
                        type="button"
                        className="wk-btn wk-btn-ghost"
                        style={{ fontSize: 11, padding: '4px 6px' }}
                        onClick={() => applyDurationToLine(line.key, support!.unit as DurationSupportUnit)}
                      >
                        {t('proposalBuilder.applyDuration')}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {support?.isMediaBuy ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        className="wk-input"
                        type="number"
                        placeholder={t('proposalBuilder.mediaBudgetPlaceholder')}
                        value={line.mediaBudgetEuros}
                        onChange={(e) =>
                          onUpdateLine(line.key, {
                            mediaBudgetEuros: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        style={{ width: 90 }}
                      />
                      <input
                        className="wk-input"
                        type="number"
                        placeholder={t('proposalBuilder.mediaMonthsPlaceholder')}
                        min={1}
                        value={line.mediaMonths}
                        onChange={(e) =>
                          onUpdateLine(line.key, {
                            mediaMonths: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        style={{ width: 64 }}
                      />
                    </div>
                  ) : (
                    <span style={{ color: 'var(--wk-text-muted)' }}>—</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="wk-btn wk-btn-ghost"
                    onClick={() => onRemoveLine(line.key)}
                    disabled={draft.lines.length <= 1}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="wk-btn wk-btn-ghost" onClick={onAddLine} style={{ marginTop: 6 }}>
        {t('proposalBuilder.addLine')}
      </button>

      <div style={{ marginTop: 14 }}>
        <label className="wk-label">{t('proposalBuilder.manualDiscounts')}</label>
        {draft.discounts.map((d) => (
          <div key={d.key} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              className="wk-input"
              type="number"
              placeholder="%"
              style={{ width: 64 }}
              value={d.ratePercent}
              onChange={(e) =>
                onUpdateDiscount(d.key, {
                  ratePercent: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
            <input
              className="wk-input"
              placeholder={t('proposalBuilder.discountReason')}
              value={d.reason}
              onChange={(e) => onUpdateDiscount(d.key, { reason: e.target.value })}
            />
            <button type="button" className="wk-btn wk-btn-ghost" onClick={() => onRemoveDiscount(d.key)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="wk-btn wk-btn-ghost" onClick={onAddDiscount}>
          {t('proposalBuilder.addDiscount')}
        </button>
      </div>

      {priced && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {'error' in priced && priced.error && (
            <div className="wk-alert wk-alert-danger">{priced.error}</div>
          )}
          <DiscountBanner
            nominalRate={priced.nominalDiscountRate}
            nominalCents={priced.nominalDiscountCents}
            effectiveRate={priced.effectiveDiscountRate}
            effectiveCents={priced.effectiveDiscountCents}
          />
          <table className="wk-table">
            <tbody>
              <tr>
                <td>{t('proposalBuilder.internalCost')}</td>
                <td>{formatCents(priced.costCents)}</td>
              </tr>
              <tr>
                <td>{t('proposalBuilder.grossFee')}</td>
                <td>{formatCents(priced.grossNetOfMediaCents)}</td>
              </tr>
              <tr>
                <td>{t('proposalBuilder.netRevenue')}</td>
                <td>
                  <strong>{formatCents(priced.netRevenueCents)}</strong>
                </td>
              </tr>
              {priced.mediaBudgetCents > 0 && (
                <tr>
                  <td>{t('proposalBuilder.mediaBudget')}</td>
                  <td>{formatCents(priced.mediaBudgetCents)}</td>
                </tr>
              )}
              <tr>
                <td>{t('proposalBuilder.billedTotal')}</td>
                <td>
                  <strong>{formatCents(priced.billedTotalCents)}</strong>
                </td>
              </tr>
              <tr>
                <td>{t('proposalBuilder.margin')}</td>
                <td>
                  <span
                    className={`wk-badge ${priced.meetsMarginFloor ? 'wk-badge-success' : 'wk-badge-danger'}`}
                  >
                    {priced.marginRate === null ? '—' : formatPercent(priced.marginRate)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
