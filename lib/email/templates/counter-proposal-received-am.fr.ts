import type { CounterProposalReceivedAmEmailTemplate } from './types';

export const counterProposalReceivedAmFr: CounterProposalReceivedAmEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `Nouvelle contre-proposition — ${advertiserName} (${proposalNumber})`,
  greeting: (ownerFirstName) => `Bonjour ${ownerFirstName},`,
  body: (advertiserName, optionCode) =>
    `${advertiserName} a proposé des modifications sur l'option ${optionCode}. Vous pouvez l'examiner et statuer depuis le détail du devis.`,
  cta: 'Examiner la contre-proposition',
  department: 'Régie publicitaire',
};
