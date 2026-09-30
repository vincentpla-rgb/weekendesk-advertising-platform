import type { CounterProposalRejectionEmailTemplate } from './types';

export const counterProposalRejectionEn: CounterProposalRejectionEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `About your proposal — ${advertiserName} (${proposalNumber})`,
  greeting: (contactFirstName) => `Dear ${contactFirstName},`,
  intro:
    "We've reviewed the changes you proposed to our visibility proposal and, after considering them, we're not able to accept them as they stand.",
  reasonIntro: 'Reason:',
  closingLine: "We remain available to keep talking and find a formula that works for both sides.",
  signOff: 'Kind regards,',
  department: 'Advertising',
};
