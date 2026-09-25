'use client';

import { useMemo, useState } from 'react';

import {
  MARKETS,
  buildCatalog,
  priceOption,
  runPreSendChecks,
  toOptionInput,
  optionDurationUnits,
  suggestedMediaMonths,
  suggestedQuantityForSupport,
  addLineDraft,
  addOptionDiscount,
  clearLeadTimeOverride,
  createOptionDraft,
  forceLeadTimeOverride,
  removeLineDraft,
  removeOptionDiscount,
  resyncLineQuantity,
  setLineQuantityManually,
  setLineSupport,
  toggleOptionMarket,
  updateOptionDiscount,
  updateOptionDraft,
  type DiscountDraft,
  type DurationSupportUnit,
  type LineDraft,
  type Market,
  type OptionDraft,
  type PreSendOptionContext,
  type PricedOption,
  type PricingParameters,
  type PublicHoliday,
  type SupportDefinition,
} from '@/src/pricing/index.js';

import { CONTENT_LANGUAGES, LANGUAGE_LABELS, type AccountRow, type ContentLanguage } from '@/lib/domain';
import { COUNTRY_CODES, countryName } from '@/lib/countries';
import { MARKET_LABELS, formatCents, formatPercent, supportLabel } from '@/lib/format';
import { DiscountBanner } from '@/components/DiscountBanner';
import { PreSendChecklist } from '@/components/PreSendChecklist';
import { EmailPreviewModal } from '@/components/EmailPreviewModal';
import { buildDraftProposalEmailPreview } from '@/lib/email/proposal-email-preview';
import { useI18n, type InternalLanguage } from '@/lib/i18n-internal';

let lineKeySeq = 0;
function nextKey() {
  lineKeySeq += 1;
  return `l${lineKeySeq}`;
}

/** Idioma de interfaz (ES/FR/EN) → locale de Intl para `countryName` (CLAUDE.md §9, ronda 2). */
const UI_TO_INTL_LOCALE: Record<InternalLanguage, 'es' | 'fr' | 'en'> = { ES: 'es', FR: 'fr', EN: 'en' };

interface ProposalBuilderInitialData {
  readonly accountId: string;
  readonly contactId: string;
  readonly language: string;
  readonly brief: string;
  readonly options: readonly OptionDraft[];
}

export function ProposalBuilder({
  parameters,
  supports,
  holidays,
  accounts,
  offerValidityDays,
  salesName,
  initialData,
  editingProposalId,
  editingProposalNumber,
  editUnavailable,
}: {
  parameters: PricingParameters;
  supports: readonly SupportDefinition[];
  holidays: readonly PublicHoliday[];
  accounts: readonly AccountRow[];
  /** CLAUDE.md §7, para la vista previa del email (ronda 12) — del juego de parámetros activo. */
  offerValidityDays: number;
  /** Nombre del comercial (creador), para la firma de la vista previa del email (ronda 12). */
  salesName: string;
  /**
   * Precarga para "Editar" un presupuesto DRAFT que nunca llegó a enviarse
   * con éxito (CLAUDE.md §5.4, §10.3 ter decies, ronda 13). `undefined` en
   * el creador normal.
   */
  initialData?: ProposalBuilderInitialData;
  /** Presente en modo edición: el DRAFT que este envío sustituye al enviarse. */
  editingProposalId?: string;
  editingProposalNumber?: string;
  /** `?editFrom=` apuntaba a un presupuesto que ya no es editable (no existe, o ya salió de DRAFT). */
  editUnavailable?: boolean;
}) {
  const { t, language: uiLanguage } = useI18n();
  const catalog = useMemo(() => buildCatalog(supports), [supports]);

  const [accountId, setAccountId] = useState<string>(initialData?.accountId ?? accounts[0]?.id ?? '__new__');
  const [newAccount, setNewAccount] = useState({ legal_name: '', country_code: 'FR' });
  const [contactId, setContactId] = useState<string>(initialData?.contactId ?? '__new__');
  const [newContact, setNewContact] = useState({ full_name: '', email: '' });
  const [language, setLanguage] = useState<ContentLanguage>((initialData?.language as ContentLanguage) ?? 'FR');
  const [brief, setBrief] = useState(initialData?.brief ?? '');
  // Se empieza con una sola opción, sin pestañas visibles (CLAUDE.md §5.1,
  // ronda 4): las pestañas solo aparecen al añadir la segunda. En modo
  // edición arranca directamente con las opciones del borrador.
  const [options, setOptions] = useState<OptionDraft[]>(
    () => initialData?.options.slice() ?? [createOptionDraft(catalog, 'A', nextKey(), nextKey(), supports)],
  );
  const [activeOptionKey, setActiveOptionKey] = useState<string>(() => options[0]!.key);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ proposalId: string; publicToken: string } | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  // Mismo par de valores que handleSubmit manda al servidor para
  // advertiserName/contactFullName (CLAUDE.md §10.3 duodecies, ronda 12) —
  // resueltos aquí, en el cliente, para poder alimentar la vista previa del
  // email sin ningún round-trip de red: cuenta/contacto existentes, o los
  // campos de "nueva cuenta"/"nuevo contacto" que todavía no se han guardado.
  const previewAdvertiserName =
    accountId === '__new__' ? newAccount.legal_name.trim() : (selectedAccount?.legal_name ?? '');
  const previewContactFullName =
    contactId === '__new__'
      ? newContact.full_name.trim()
      : (selectedAccount?.contacts.find((c) => c.id === contactId)?.full_name ?? '');
  const canPreviewEmail = previewAdvertiserName !== '' && previewContactFullName !== '';

  // --- Transiciones de estado: todas delegan en el módulo puro
  // (src/pricing/option-draft.ts), testeado de extremo a extremo sin React.
  // Aquí solo se conecta useState a esas funciones — ninguna reimplementa la
  // lógica de auto-sincronización de cantidades (CLAUDE.md §4, ronda 6).

  function updateOption(key: string, patch: Parameters<typeof updateOptionDraft>[2]) {
    setOptions((prev) => prev.map((o) => (o.key === key ? updateOptionDraft(catalog, o, patch) : o)));
  }

  function toggleMarket(optionKey: string, market: Market) {
    setOptions((prev) => prev.map((o) => (o.key === optionKey ? toggleOptionMarket(o, market) : o)));
  }

  function changeLineSupport(optionKey: string, lineKey: string, supportId: string) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionKey ? setLineSupport(catalog, o, lineKey, supportId) : o)),
    );
  }

  function setLineQuantity(optionKey: string, lineKey: string, quantity: number) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionKey ? setLineQuantityManually(o, lineKey, quantity) : o)),
    );
  }

  function resyncLine(optionKey: string, lineKey: string) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionKey ? resyncLineQuantity(catalog, o, lineKey) : o)),
    );
  }

  function updateLineMedia(
    optionKey: string,
    lineKey: string,
    patch: Partial<Pick<LineDraft, 'mediaBudgetEuros' | 'manualFeeEuros' | 'manualFeeReason'>>,
  ) {
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
      prev.map((o) => (o.key === optionKey ? addLineDraft(catalog, o, supports[0]?.id ?? '', nextKey()) : o)),
    );
  }

  function removeLine(optionKey: string, lineKey: string) {
    setOptions((prev) => prev.map((o) => (o.key === optionKey ? removeLineDraft(o, lineKey) : o)));
  }

  function addDiscount(optionKey: string) {
    setOptions((prev) => prev.map((o) => (o.key === optionKey ? addOptionDiscount(o, nextKey()) : o)));
  }

  function updateDiscount(optionKey: string, discountKey: string, patch: Partial<DiscountDraft>) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionKey ? updateOptionDiscount(o, discountKey, patch) : o)),
    );
  }

  function removeDiscount(optionKey: string, discountKey: string) {
    setOptions((prev) => prev.map((o) => (o.key === optionKey ? removeOptionDiscount(o, discountKey) : o)));
  }

  function addOption() {
    if (options.length >= 3) return;
    const nextCode = (['A', 'B', 'C'] as const)[options.length]!;
    const next = createOptionDraft(catalog, nextCode, nextKey(), nextKey(), supports);
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

  // Antelación insuficiente forzada a mano (CLAUDE.md §5.3, ronda 11): el
  // ÚNICO bloqueo duro forzable. El checklist es global a todas las
  // opciones (más abajo), así que cada resultado lleva su `optionId` para
  // enrutar el forzado a la opción correcta.
  function forceLeadTime(optionId: string, supportId: string, market: Market, reason: string) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionId ? forceLeadTimeOverride(o, supportId, market, reason) : o)),
    );
  }

  function clearForcedLeadTime(optionId: string, supportId: string, market: Market) {
    setOptions((prev) =>
      prev.map((o) => (o.key === optionId ? clearLeadTimeOverride(o, supportId, market) : o)),
    );
  }

  // --- Cálculo en vivo, con el mismo motor puro que corre en el servidor ---
  // Es solo una vista previa: el servidor recalcula con este mismo motor a
  // partir de los datos crudos al enviar, y esos números (no estos) son los
  // que se persisten y se congelan.
  let priced: (PricedOption & { error?: string })[] = [];
  try {
    priced = options.map((draft) => {
      try {
        return priceOption(toOptionInput(catalog, draft), { parameters, catalog });
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
    campaignEnd:
      draft.scheduleMode === 'DATES' && draft.campaignEnd
        ? new Date(`${draft.campaignEnd}T00:00:00Z`)
        : null,
    durationOnly: draft.scheduleMode === 'DURATION_ONLY',
    leadTimeOverrides: draft.leadTimeOverrides,
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
          // En modo edición (CLAUDE.md §10.3 ter decies, ronda 13): el
          // borrador que este envío sustituye. Se borra tras crear el nuevo
          // con éxito — nunca antes, para no perder datos si la creación
          // falla (p. ej. un conflicto de disponibilidad nuevo).
          replacesDraftId: editingProposalId ?? null,
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
                // Nunca un campo manual (CLAUDE.md §4.4, ronda 9): se deriva
                // de la duración vigente de la opción, la MISMA función que
                // alimenta la vista previa en vivo.
                mediaMonths: suggestedMediaMonths(o),
                // Reparto forzado a mano (CLAUDE.md §4.4, ronda 10): vacío = automático.
                manualFeeEuros: l.manualFeeEuros === '' ? null : l.manualFeeEuros,
                manualFeeReason: l.manualFeeEuros === '' ? null : l.manualFeeReason,
              })),
            discounts: o.discounts
              .filter((d) => d.ratePercent !== '' && d.reason.trim() !== '')
              .map((d) => ({ ratePercent: d.ratePercent, reason: d.reason })),
            volumeDiscountDisabled: o.volumeDiscountDisabled,
            // Antelación insuficiente forzada a mano (CLAUDE.md §5.3, ronda
            // 11): el único bloqueo duro forzable, con motivo obligatorio.
            leadTimeOverrides: o.leadTimeOverrides.map((lto) => ({
              supportId: lto.supportId,
              market: lto.market,
              reason: lto.reason,
            })),
          })),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? 'Error al crear el envío');
      }
      setResult({ proposalId: body.proposalId, publicToken: body.publicToken });
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
        {editingProposalId && (
          <p style={{ color: 'var(--wk-text-muted)', fontSize: 13 }}>{t('proposalBuilder.draftReplacedNotice')}</p>
        )}
        <div className="wk-input" style={{ marginBottom: 12, userSelect: 'all' }}>{publicUrl}</div>
        {/* No dejar al comercial sin salida (CLAUDE.md §10.1.1, ronda 7):
            antes solo se podía ver la pantalla pública — ni un enlace de
            vuelta al presupuesto que se acaba de crear, ni una forma clara
            de empezar el siguiente sin recargar la página a mano. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="wk-btn wk-btn-secondary" href={publicUrl} target="_blank" rel="noreferrer">
            {t('proposalBuilder.viewPublic')}
          </a>
          <a className="wk-btn wk-btn-secondary" href={`/proposals/${result.proposalId}`}>
            {t('proposalBuilder.viewProposal')}
          </a>
          <a className="wk-btn wk-btn-primary" href="/proposals/new">
            {t('proposalBuilder.createAnother')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1>{editingProposalNumber ? t('proposalBuilder.editTitle', { number: editingProposalNumber }) : t('proposalBuilder.title')}</h1>
      {editUnavailable && (
        <div className="wk-alert wk-alert-warning">{t('proposalBuilder.editUnavailable')}</div>
      )}

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
              {/* El nombre tecleado se refleja en la propia etiqueta de la
                  opción (CLAUDE.md §10.3 novies): no hay ningún contacto
                  que "seleccionar" todavía — no existe en la base de datos
                  hasta que se envía el presupuesto — pero así el
                  desplegable deja de parecer que ignora lo escrito abajo. */}
              <option value="__new__">
                {contactId === '__new__' && newContact.full_name.trim()
                  ? `${t('proposalBuilder.newContact')}: ${newContact.full_name.trim()}`
                  : t('proposalBuilder.newContact')}
              </option>
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
            onChangeLineSupport={(lineKey, supportId) => changeLineSupport(draft.key, lineKey, supportId)}
            onSetLineQuantity={(lineKey, quantity) => setLineQuantity(draft.key, lineKey, quantity)}
            onResyncLine={(lineKey) => resyncLine(draft.key, lineKey)}
            onUpdateLineMedia={(lineKey, patch) => updateLineMedia(draft.key, lineKey, patch)}
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

      <section className="wk-card">
        <h3>{t('proposalBuilder.preSendChecks')}</h3>
        <PreSendChecklist
          blockers={preSend.blockers}
          warnings={preSend.warnings}
          onForceLeadTime={forceLeadTime}
          onClearLeadTimeOverride={clearForcedLeadTime}
        />
      </section>

      {submitError && <div className="wk-alert wk-alert-danger">{submitError}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="wk-btn wk-btn-primary"
          disabled={!preSend.canSend || hasEngineErrors || submitting}
          onClick={handleSubmit}
          style={{ fontSize: 15, padding: '12px 24px' }}
        >
          {submitting
            ? t('proposalBuilder.sending')
            : editingProposalId
              ? t('proposalBuilder.saveAndSend')
              : t('proposalBuilder.send')}
        </button>
        <button
          type="button"
          className="wk-btn wk-btn-secondary"
          disabled={!canPreviewEmail}
          title={canPreviewEmail ? undefined : t('proposalBuilder.previewEmailNeedsData')}
          onClick={() => setShowEmailPreview(true)}
        >
          {t('proposalBuilder.previewEmail')}
        </button>
      </div>

      {showEmailPreview && (
        <EmailPreviewModal
          content={buildDraftProposalEmailPreview({
            advertiserName: previewAdvertiserName,
            contactFullName: previewContactFullName,
            brief: brief || null,
            numberOfOptions: options.length,
            salesName,
            offerValidityDays,
            language,
          })}
          onClose={() => setShowEmailPreview(false)}
        />
      )}
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
  onChangeLineSupport,
  onSetLineQuantity,
  onResyncLine,
  onUpdateLineMedia,
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
  onUpdate: (patch: Parameters<typeof updateOptionDraft>[2]) => void;
  onToggleMarket: (market: Market) => void;
  onChangeLineSupport: (lineKey: string, supportId: string) => void;
  onSetLineQuantity: (lineKey: string, quantity: number) => void;
  onResyncLine: (lineKey: string) => void;
  onUpdateLineMedia: (
    lineKey: string,
    patch: Partial<Pick<LineDraft, 'mediaBudgetEuros' | 'manualFeeEuros' | 'manualFeeReason'>>,
  ) => void;
  onAddLine: () => void;
  onRemoveLine: (lineKey: string) => void;
  onAddDiscount: () => void;
  onUpdateDiscount: (discountKey: string, patch: Partial<DiscountDraft>) => void;
  onRemoveDiscount: (discountKey: string) => void;
  onRemoveOption: (() => void) | null;
}) {
  const { t } = useI18n();

  // Solo para el texto informativo bajo el selector de periodo — la MISMA
  // conversión que ya usa el motor para sugerir la cantidad de cada línea
  // (CLAUDE.md §5.3, ronda 2 — y §4, ronda 6, para el porqué ya no hace
  // falta pulsar nada).
  const duration: { count: number; unit: DurationSupportUnit; weeks: number; months: number } | null = (() => {
    if (draft.scheduleMode === 'DURATION_ONLY') {
      return draft.durationCount === ''
        ? null
        : { count: draft.durationCount, unit: draft.durationUnit, weeks: 0, months: 0 };
    }
    const units = optionDurationUnits(draft);
    if (units === null) return null;
    return { count: units.weeks, unit: 'WEEK', weeks: units.weeks, months: units.months };
  })();

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
          {draft.scheduleMode === 'DATES'
            ? `${duration.weeks} ${t('proposalBuilder.durationUnitWeek')} (${duration.months} ${t('proposalBuilder.durationUnitMonth')})`
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
            // La cantidad se rellena sola mientras la línea siga en modo
            // automático (CLAUDE.md §4, ronda 6): el botón de abajo solo
            // hace falta para RESINCRONIZAR una línea que el comercial ya
            // editó a mano, si el periodo cambia después de esa edición.
            const suggestedQuantity = suggestedQuantityForSupport(draft, support);
            const canResync = suggestedQuantity !== null && !line.quantityAutoSynced;
            const isAutoManaged = suggestedQuantity !== null && line.quantityAutoSynced;
            return (
              <tr key={line.key}>
                <td>
                  <select
                    className="wk-select"
                    value={line.supportId}
                    onChange={(e) => onChangeLineSupport(line.key, e.target.value)}
                  >
                    {supports.map((s) => (
                      <option key={s.id} value={s.id}>
                        {supportLabel(s.name, s.id)}
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
                      onChange={(e) => onSetLineQuantity(line.key, Number(e.target.value))}
                      style={{ width: 68 }}
                    />
                    {isAutoManaged && (
                      <span
                        className="wk-badge wk-badge-neutral"
                        style={{ fontSize: 10, padding: '2px 6px' }}
                        title={t('proposalBuilder.autoQuantityHint')}
                      >
                        {t('proposalBuilder.autoQuantityHint')}
                      </span>
                    )}
                    {canResync && (
                      <button
                        type="button"
                        className="wk-btn wk-btn-ghost"
                        style={{ fontSize: 11, padding: '4px 6px' }}
                        onClick={() => onResyncLine(line.key)}
                      >
                        {t('proposalBuilder.applyDuration')}
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  {support?.isMediaBuy ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div>
                          <label className="wk-label" style={{ fontSize: 10 }}>
                            {t('proposalBuilder.mediaBudgetLabel')}
                          </label>
                          <input
                            className="wk-input"
                            type="number"
                            placeholder={t('proposalBuilder.mediaBudgetPlaceholder')}
                            value={line.mediaBudgetEuros}
                            onChange={(e) =>
                              onUpdateLineMedia(line.key, {
                                mediaBudgetEuros: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                            style={{
                              width: 100,
                              borderColor: line.mediaBudgetEuros === '' ? 'var(--wk-danger)' : undefined,
                            }}
                          />
                          {line.mediaBudgetEuros === '' && (
                            <div className="wk-badge wk-badge-danger" style={{ marginTop: 2, fontSize: 10 }}>
                              {t('proposalBuilder.mediaBudgetRequired')}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="wk-label" style={{ fontSize: 10 }}>
                            {t('proposalBuilder.mediaMonthsAutoLabel')}
                          </label>
                          {/* Nunca manual (CLAUDE.md §4.4, ronda 9): se deriva de la
                              duración de la opción, igual que la cantidad de las
                              demás líneas — si el periodo cambia, este valor se
                              actualiza solo. */}
                          <input
                            className="wk-input"
                            type="number"
                            disabled
                            value={suggestedMediaMonths(draft) ?? ''}
                            title={t('proposalBuilder.mediaMonthsAutoHint')}
                            style={{ width: 64, color: 'var(--wk-text-muted)' }}
                          />
                        </div>
                      </div>

                      <MediaFeeSplit
                        support={support}
                        line={line}
                        pricedLine={priced?.lines.find((l) => l.supportId === line.supportId) ?? null}
                        onUpdateLineMedia={(patch) => onUpdateLineMedia(line.key, patch)}
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

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={draft.volumeDiscountDisabled}
            onChange={(e) => onUpdate({ volumeDiscountDisabled: e.target.checked })}
          />
          {t('proposalBuilder.disableVolumeDiscount')}
        </label>
        <p style={{ fontSize: 12, color: 'var(--wk-text-muted)', margin: '2px 0 0 22px' }}>
          {t('proposalBuilder.disableVolumeDiscountHelp')}
        </p>
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

/**
 * Reparto del presupuesto de medios entre el importe real al medio y el fee
 * de gestión de Weekendesk (CLAUDE.md §4.4, ronda 10) — interno, nunca de
 * cara al cliente (§6). Dos modos:
 *
 * - **ADS-01/02/03**: automático por defecto (40 % del presupuesto, o el
 *   mínimo mensual × meses). Un checkbox permite forzarlo a mano para un
 *   caso negociado — fijo, inmune a descuentos posteriores.
 * - **INF-01** (`alwaysManualMediaSplit`): siempre manual, nunca automático
 *   — cada colaboración se negocia caso por caso. El campo pide el importe
 *   PARA EL INFLUENCER; el fee (lo que guarda el motor) es la resta contra
 *   el presupuesto total, para no introducir un segundo modelo de datos.
 */
function MediaFeeSplit({
  support,
  line,
  pricedLine,
  onUpdateLineMedia,
}: {
  support: SupportDefinition;
  line: LineDraft;
  pricedLine: PricedOption['lines'][number] | null;
  onUpdateLineMedia: (patch: Partial<Pick<LineDraft, 'mediaBudgetEuros' | 'manualFeeEuros' | 'manualFeeReason'>>) => void;
}) {
  const { t } = useI18n();
  const budgetEuros = line.mediaBudgetEuros === '' ? null : line.mediaBudgetEuros;
  const forced = line.manualFeeEuros !== '';

  const exceedsBudget = pricedLine?.mediaRealSpendCents !== null &&
    pricedLine?.mediaRealSpendCents !== undefined &&
    pricedLine.mediaRealSpendCents < 0;

  const desglose = pricedLine && pricedLine.isMediaBuy ? (
    <p style={{ fontSize: 11, color: exceedsBudget ? 'var(--wk-danger)' : 'var(--wk-text-muted)', margin: 0 }}>
      {t('proposalBuilder.mediaFeeLabel')}: {formatCents(pricedLine.netPriceCents)} ·{' '}
      {t('proposalBuilder.mediaRealSpendLabel')}: {formatCents(pricedLine.mediaRealSpendCents ?? 0)}
      {exceedsBudget ? ` — ${t('proposalBuilder.mediaFeeExceedsBudget')}` : ''}
    </p>
  ) : null;

  if (support.alwaysManualMediaSplit) {
    // INF-01: siempre manual. El campo visible es "importe para el
    // influencer"; `manualFeeEuros` (lo que se manda al motor) es el resto
    // del presupuesto total.
    const influencerEuros = budgetEuros === null || !forced ? '' : budgetEuros - Number(line.manualFeeEuros);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div>
            <label className="wk-label" style={{ fontSize: 10 }}>
              {t('proposalBuilder.influencerAmountLabel')}
            </label>
            <input
              className="wk-input"
              type="number"
              disabled={budgetEuros === null}
              value={influencerEuros}
              onChange={(e) => {
                if (budgetEuros === null) return;
                const influencer = e.target.value === '' ? null : Number(e.target.value);
                onUpdateLineMedia({
                  manualFeeEuros: influencer === null ? '' : budgetEuros - influencer,
                });
              }}
              style={{ width: 100 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="wk-label" style={{ fontSize: 10 }}>
              {t('proposalBuilder.manualFeeReasonLabel')}
            </label>
            <input
              className="wk-input"
              value={line.manualFeeReason}
              onChange={(e) => onUpdateLineMedia({ manualFeeReason: e.target.value })}
              style={{ width: 160 }}
            />
          </div>
        </div>
        {!forced && (
          <div className="wk-badge wk-badge-danger" style={{ fontSize: 10, width: 'fit-content' }}>
            {t('proposalBuilder.mediaSplitRequired')}
          </div>
        )}
        {desglose}
      </div>
    );
  }

  // ADS-01/02/03: automático por defecto, forzable a mano.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <input
          type="checkbox"
          checked={forced}
          onChange={(e) =>
            onUpdateLineMedia(
              e.target.checked ? { manualFeeEuros: 0, manualFeeReason: '' } : { manualFeeEuros: '', manualFeeReason: '' },
            )
          }
        />
        {t('proposalBuilder.forceMediaFee')}
      </label>
      {forced && (
        <div style={{ display: 'flex', gap: 8 }}>
          <div>
            <label className="wk-label" style={{ fontSize: 10 }}>
              {t('proposalBuilder.manualFeeLabel')}
            </label>
            <input
              className="wk-input"
              type="number"
              value={line.manualFeeEuros}
              onChange={(e) =>
                onUpdateLineMedia({ manualFeeEuros: e.target.value === '' ? 0 : Number(e.target.value) })
              }
              style={{ width: 100 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="wk-label" style={{ fontSize: 10 }}>
              {t('proposalBuilder.manualFeeReasonLabel')}
            </label>
            <input
              className="wk-input"
              value={line.manualFeeReason}
              onChange={(e) => onUpdateLineMedia({ manualFeeReason: e.target.value })}
              style={{ width: 160 }}
            />
          </div>
        </div>
      )}
      {desglose}
    </div>
  );
}
