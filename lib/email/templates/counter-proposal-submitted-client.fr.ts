import type { CounterProposalSubmittedClientEmailTemplate } from './types';

export const counterProposalSubmittedClientFr: CounterProposalSubmittedClientEmailTemplate = {
  subject: (proposalNumber) => `Nous avons bien reçu votre proposition — ${proposalNumber}`,
  greeting: (contactFirstName) => `Bonjour ${contactFirstName},`,
  body: 'Nous avons bien reçu les modifications que vous avez proposées et les examinerons rapidement. Nous reviendrons vers vous avec notre réponse.',
  closingLine: 'Merci pour votre temps.',
  signOff: 'Bien cordialement,',
  department: 'Régie publicitaire',
};
