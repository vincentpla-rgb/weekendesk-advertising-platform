import type { CounterProposalAcceptedClientEmailTemplate } from './types';

export const counterProposalAcceptedClientEn: CounterProposalAcceptedClientEmailTemplate = {
  subject: (proposalNumber) => `We've accepted your proposal — ${proposalNumber}`,
  greeting: (contactFirstName) => `Dear ${contactFirstName},`,
  body: "We've reviewed the changes you proposed and we're happy to accept them. We'll be in touch shortly about next steps.",
  closingLine: 'Thank you for your time and for moving forward with us.',
  signOff: 'Kind regards,',
  department: 'Advertising',
};
