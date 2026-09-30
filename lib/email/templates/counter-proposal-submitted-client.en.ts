import type { CounterProposalSubmittedClientEmailTemplate } from './types';

export const counterProposalSubmittedClientEn: CounterProposalSubmittedClientEmailTemplate = {
  subject: (proposalNumber) => `We've received your proposal — ${proposalNumber}`,
  greeting: (contactFirstName) => `Dear ${contactFirstName},`,
  body: "We've received the changes you proposed and will review them shortly. We'll be in touch with our response.",
  closingLine: 'Thank you for your time.',
  signOff: 'Kind regards,',
  department: 'Advertising',
};
