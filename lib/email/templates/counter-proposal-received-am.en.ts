import type { CounterProposalReceivedAmEmailTemplate } from './types';

export const counterProposalReceivedAmEn: CounterProposalReceivedAmEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `New counter-offer — ${advertiserName} (${proposalNumber})`,
  greeting: (ownerFirstName) => `Hi ${ownerFirstName},`,
  body: (advertiserName, optionCode) =>
    `${advertiserName} has proposed changes to option ${optionCode}. You can review it and decide from the proposal's detail page.`,
  cta: 'Review counter-offer',
  department: 'Advertising',
};
