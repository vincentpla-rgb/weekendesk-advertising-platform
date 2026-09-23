'use client';

import { useI18n } from '@/lib/i18n-internal';
import { countryName } from '@/lib/countries';

export interface AccountListRow {
  readonly id: string;
  readonly legal_name: string;
  readonly country_code: string;
  readonly contactsCount: number;
  readonly proposalsCount: number;
}

export function AccountsListClient({ accounts }: { accounts: readonly AccountListRow[] }) {
  const { t, language } = useI18n();
  const intlLocale = language === 'ES' ? 'es' : language === 'FR' ? 'fr' : 'en';

  return (
    <>
      <h1>{t('accountsList.title')}</h1>
      {accounts.length === 0 ? (
        <p style={{ color: 'var(--wk-text-muted)' }}>{t('accountsList.empty')}</p>
      ) : (
        <table className="wk-table">
          <thead>
            <tr>
              <th>{t('accountsList.colLegalName')}</th>
              <th>{t('accountsList.colCountry')}</th>
              <th>{t('accountsList.colContacts')}</th>
              <th>{t('accountsList.colProposals')}</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>
                  <a href={`/accounts/${a.id}`}>{a.legal_name}</a>
                </td>
                <td>{countryName(a.country_code, intlLocale)}</td>
                <td>{a.contactsCount}</td>
                <td>{a.proposalsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
