import type { CounterProposalAcceptedClientEmailTemplate } from './types';

export const counterProposalAcceptedClientFr: CounterProposalAcceptedClientEmailTemplate = {
  subject: (proposalNumber) => `Nous avons accepté votre proposition — ${proposalNumber}`,
  greeting: (contactFirstName) => `Bonjour ${contactFirstName},`,
  body: "Nous avons examiné les modifications que vous avez proposées et nous les acceptons. Nous reviendrons vers vous rapidement pour les prochaines étapes.",
  closingLine: 'Merci pour votre temps et pour continuer avec nous.',
  signOff: 'Bien cordialement,',
  department: 'Régie publicitaire',
};
