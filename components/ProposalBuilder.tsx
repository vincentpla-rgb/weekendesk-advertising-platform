'use client';

import { useMemo, useState } from 'react';

import {
  MARKETS,
  availabilityKey,
  buildCatalog,
  euros,
  priceOption,
  runPreSendChecks,
  toEuros,
  type Market,
  type ManualDiscount,
  type OptionInput,
  type OptionLineInput,
  type PricedOption,
  type PricingParameters,
  type PublicHoliday,
  type SupportDefinition,
} from '@/src/pricing/index.js';

import { CONTENT_LANGUAGES, LANGUAGE_LABELS, type AccountRow, type ContentLanguage } from '@/lib/domain';
import { MARKET_LABELS, formatCents, formatPercent } from '@/lib/format';
import { DiscountBanner } from '@/components/DiscountBanner';
import { PreSendChecklist } from '@/components/PreSendChecklist';

let lineKeySeq = 0;
function nextKey() {
  lineKeySeq += 1;
  return `l${lineKeySeq}`;
}

interface LineDraft {
  readonly key: string;
  supportId: string;
  market: Market;
  quantity: number;
  mediaBudgetEuros: number | '';
  mediaMonths: number | '';
  availabilityConfirmedWith: string;
}

interface DiscountDraft {
  readonly key: string;
  ratePercent: number | '';
  reason: string;
}

interface OptionDraft {
  readonly key: string;
  code: 'A' | 'B' | 'C';
  name: string;
  pitch: string;
  lines: LineDraft[];
  discounts: DiscountDraft[];
}

function emptyLine(supports: readonly SupportDefinition[]): LineDraft {
  return {
    key: nextKey(),
    supportId: supports[0]?.id ?? '',
    market: 'FR',
    quantity: 1,
    mediaBudgetEuros: '',
    mediaMonths: '',
    availabilityConfirmedWith: '',
  };
}

function emptyOption(code: OptionDraft['code'], supports: readonly SupportDefinition[]): OptionDraft {
  return { key: nextKey(), code, name: '', pitch: '', lines: [emptyLine(supports)], discounts: [] };
}

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
  const catalog = useMemo(() => buildCatalog(supports), [supports]);

  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? '__new__');
  const [newAccount, setNewAccount] = useState({ legal_name: '', country_code: 'FR', primary_market: 'FR' as Market });
  const [contactId, setContactId] = useState<string>('__new__');
  const [newContact, setNewContact] = useState({ full_name: '', email: '', language: 'FR' as ContentLanguage });
  const [language, setLanguage] = useState<ContentLanguage>('FR');
  const [brief, setBrief] = useState('');
  const [campaignStart, setCampaignStart] = useState('');
  const [campaignEnd, setCampaignEnd] = useState('');
  const [options, setOptions] = useState<OptionDraft[]>([
    emptyOption('A', supports),
    emptyOption('B', supports),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicToken: string } | null>(null);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? null;

  function updateOption(key: string, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
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
    setOptions((prev) => {
      if (prev.length >= 3) return prev;
      const nextCode = (['A', 'B', 'C'] as const)[prev.length]!;
      return [...prev, emptyOption(nextCode, supports)];
    });
  }

  function removeOption(key: string) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((o) => o.key !== key)));
  }

  // --- Cálculo en vivo, con el mismo motor puro que corre en el servidor ---
  // Es solo una vista previa: el servidor recalcula con este mismo motor a
  // partir de los datos crudos al enviar, y esos números (no estos) son los
  // que se persisten y se congelan.
  const draftToOptionInput = (draft: OptionDraft): OptionInput => ({
    id: draft.key,
    name: draft.name || undefined,
    lines: draft.lines
      .filter((l) => l.supportId)
      .map((l): OptionLineInput => {
        const support = catalog.get(l.supportId);
        return {
          supportId: l.supportId,
          market: l.market,
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

  const confirmedAvailability = new Set<string>(
    options.flatMap((o) =>
      o.lines
        .filter((l) => l.availabilityConfirmedWith.trim() !== '')
        .map((l) => availabilityKey(l.supportId, l.market)),
    ),
  );

  const preSend = runPreSendChecks(priced, {
    today: new Date(),
    campaignStart: campaignStart ? new Date(`${campaignStart}T00:00:00Z`) : null,
    brief,
    confirmedAvailability,
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
          newContact: contactId === '__new__' ? newContact : null,
          language,
          brief,
          campaignStart: campaignStart || null,
          campaignEnd: campaignEnd || null,
          options: options.map((o) => ({
            code: o.code,
            name: o.name,
            pitch: o.pitch,
            lines: o.lines
              .filter((l) => l.supportId)
              .map((l) => ({
                supportId: l.supportId,
                market: l.market,
                quantity: l.quantity,
                mediaBudgetEuros: l.mediaBudgetEuros === '' ? null : l.mediaBudgetEuros,
                mediaMonths: l.mediaMonths === '' ? null : l.mediaMonths,
                availabilityConfirmedWith: l.availabilityConfirmedWith || null,
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
        <h2>Envío enviado</h2>
        <p style={{ color: 'var(--wk-text-muted)' }}>
          El envío está congelado y el email ya ha salido a <strong>{contactEmail}</strong>, con copia
          a ti y a contracting@weekendesk.fr. Ningún cambio posterior lo altera.
        </p>
        <div className="wk-input" style={{ marginBottom: 12, userSelect: 'all' }}>{publicUrl}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="wk-btn wk-btn-secondary" href={publicUrl} target="_blank" rel="noreferrer">
            Ver pantalla pública
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1>Nuevo presupuesto</h1>

      <section className="wk-card">
        <h3>Cuenta y contacto</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label className="wk-label">Cuenta</label>
            <select
              className="wk-select"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setContactId('__new__');
              }}
            >
              <option value="__new__">+ Nueva cuenta</option>
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
                  placeholder="Razón social"
                  value={newAccount.legal_name}
                  onChange={(e) => setNewAccount({ ...newAccount, legal_name: e.target.value })}
                />
                <input
                  className="wk-input"
                  placeholder="País (ISO-2, ej. FR)"
                  value={newAccount.country_code}
                  maxLength={2}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, country_code: e.target.value.toUpperCase() })
                  }
                />
              </div>
            )}
          </div>

          <div>
            <label className="wk-label">Contacto</label>
            <select
              className="wk-select"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              disabled={accountId === '__new__' && selectedAccount === null}
            >
              <option value="__new__">+ Nuevo contacto</option>
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
                  placeholder="Nombre y apellidos"
                  value={newContact.full_name}
                  onChange={(e) => setNewContact({ ...newContact, full_name: e.target.value })}
                />
                <input
                  className="wk-input"
                  placeholder="Email"
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
        <h3>Envío</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 12 }}>
          <div>
            <label className="wk-label">Idioma del cliente</label>
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
          </div>
          <div>
            <label className="wk-label">Inicio de campaña</label>
            <input
              className="wk-input"
              type="date"
              value={campaignStart}
              onChange={(e) => setCampaignStart(e.target.value)}
            />
          </div>
          <div>
            <label className="wk-label">Fin de campaña</label>
            <input
              className="wk-input"
              type="date"
              value={campaignEnd}
              onChange={(e) => setCampaignEnd(e.target.value)}
            />
          </div>
        </div>
        <label className="wk-label">Brief de campaña</label>
        <textarea
          className="wk-textarea"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Qué busca el cliente, temporada, destino…"
        />
      </section>

      <div className="wk-grid-options">
        {options.map((draft, idx) => {
          const p = priced[idx];
          return (
            <OptionEditor
              key={draft.key}
              draft={draft}
              priced={p ?? null}
              supports={supports}
              catalog={catalog}
              onUpdate={(patch) => updateOption(draft.key, patch)}
              onUpdateLine={(lineKey, patch) => updateLine(draft.key, lineKey, patch)}
              onAddLine={() => addLine(draft.key)}
              onRemoveLine={(lineKey) => removeLine(draft.key, lineKey)}
              onAddDiscount={() => addDiscount(draft.key)}
              onUpdateDiscount={(dKey, patch) => updateDiscount(draft.key, dKey, patch)}
              onRemoveDiscount={(dKey) => removeDiscount(draft.key, dKey)}
              onRemoveOption={options.length > 2 ? () => removeOption(draft.key) : null}
            />
          );
        })}
      </div>

      {options.length < 3 && (
        <button type="button" className="wk-btn wk-btn-secondary" onClick={addOption} style={{ alignSelf: 'flex-start' }}>
          + Añadir opción
        </button>
      )}

      <section className="wk-card">
        <h3>Controles previos al envío</h3>
        <PreSendChecklist blockers={preSend.blockers} warnings={preSend.warnings} />
      </section>

      {submitError && <div className="wk-alert wk-alert-danger">{submitError}</div>}

      <button
        type="button"
        className="wk-btn wk-btn-primary"
        disabled={!preSend.canSend || hasEngineErrors || submitting}
        onClick={handleSubmit}
        style={{ alignSelf: 'flex-start', fontSize: 15, padding: '12px 24px' }}
      >
        {submitting ? 'Enviando…' : 'Enviar al cliente'}
      </button>
    </div>
  );
}

function OptionEditor({
  draft,
  priced,
  supports,
  catalog,
  onUpdate,
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
  onUpdateLine: (lineKey: string, patch: Partial<LineDraft>) => void;
  onAddLine: () => void;
  onRemoveLine: (lineKey: string) => void;
  onAddDiscount: () => void;
  onUpdateDiscount: (discountKey: string, patch: Partial<DiscountDraft>) => void;
  onRemoveDiscount: (discountKey: string) => void;
  onRemoveOption: (() => void) | null;
}) {
  return (
    <div className="wk-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>Opción {draft.code}</h3>
        {onRemoveOption && (
          <button type="button" className="wk-btn wk-btn-ghost" onClick={onRemoveOption}>
            Quitar
          </button>
        )}
      </div>

      <input
        className="wk-input"
        placeholder="Nombre de la opción (ej. Entrada, Amplia, Premium)"
        value={draft.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        style={{ marginBottom: 8 }}
      />
      <textarea
        className="wk-textarea"
        placeholder="Frase de opción: lógica estratégica en 1-2 líneas"
        value={draft.pitch}
        onChange={(e) => onUpdate({ pitch: e.target.value })}
        style={{ minHeight: 50, marginBottom: 12 }}
      />

      <table className="wk-table">
        <thead>
          <tr>
            <th>Soporte</th>
            <th>Mercado</th>
            <th>Cant.</th>
            <th>Medios</th>
            <th>Disponibilidad</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line) => {
            const support = catalog.get(line.supportId);
            const pricedLine = priced?.lines.find(
              (l) => l.supportId === line.supportId && l.market === line.market,
            );
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
                  {pricedLine && !pricedLine.sellable && (
                    <div className="wk-badge wk-badge-danger" style={{ marginTop: 4 }}>
                      No vendible en {MARKET_LABELS[line.market]}
                    </div>
                  )}
                </td>
                <td>
                  <select
                    className="wk-select"
                    value={line.market}
                    onChange={(e) => onUpdateLine(line.key, { market: e.target.value as Market })}
                  >
                    {MARKETS.map((m) => (
                      <option key={m} value={m}>
                        {MARKET_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="wk-input"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={line.quantity}
                    onChange={(e) => onUpdateLine(line.key, { quantity: Number(e.target.value) })}
                    style={{ width: 68 }}
                  />
                </td>
                <td>
                  {support?.isMediaBuy ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        className="wk-input"
                        type="number"
                        placeholder="€ medios"
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
                        placeholder="meses"
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
                  {support?.requiresAvailabilityCheck ? (
                    <input
                      className="wk-input"
                      placeholder="Confirmado con…"
                      value={line.availabilityConfirmedWith}
                      onChange={(e) =>
                        onUpdateLine(line.key, { availabilityConfirmedWith: e.target.value })
                      }
                    />
                  ) : (
                    <span style={{ color: 'var(--wk-text-muted)' }}>No aplica</span>
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
        + Añadir línea
      </button>

      <div style={{ marginTop: 14 }}>
        <label className="wk-label">Descuentos manuales</label>
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
              placeholder="Motivo (obligatorio)"
              value={d.reason}
              onChange={(e) => onUpdateDiscount(d.key, { reason: e.target.value })}
            />
            <button type="button" className="wk-btn wk-btn-ghost" onClick={() => onRemoveDiscount(d.key)}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="wk-btn wk-btn-ghost" onClick={onAddDiscount}>
          + Añadir descuento
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
                <td>Coste interno</td>
                <td>{formatCents(priced.costCents)}</td>
              </tr>
              <tr>
                <td>Tarifa bruta (neta de medios)</td>
                <td>{formatCents(priced.grossNetOfMediaCents)}</td>
              </tr>
              <tr>
                <td>Importe neto de medios</td>
                <td>
                  <strong>{formatCents(priced.netRevenueCents)}</strong>
                </td>
              </tr>
              {priced.mediaBudgetCents > 0 && (
                <tr>
                  <td>Presupuesto de medios</td>
                  <td>{formatCents(priced.mediaBudgetCents)}</td>
                </tr>
              )}
              <tr>
                <td>Importe facturado</td>
                <td>
                  <strong>{formatCents(priced.billedTotalCents)}</strong>
                </td>
              </tr>
              <tr>
                <td>Margen</td>
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
