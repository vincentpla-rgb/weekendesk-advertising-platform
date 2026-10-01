import type { CounterProposalSubmittedClientEmailTemplate } from './types';

export const counterProposalSubmittedClientIt: CounterProposalSubmittedClientEmailTemplate = {
  subject: (proposalNumber) => `Abbiamo ricevuto la tua proposta — ${proposalNumber}`,
  greeting: (contactFirstName) => `Gentile ${contactFirstName},`,
  body: 'Abbiamo ricevuto le modifiche che hai proposto e le esamineremo a breve. Ti ricontatteremo con la nostra risposta.',
  closingLine: 'Grazie per il tuo tempo.',
  signOff: 'Cordiali saluti,',
  department: 'Pubblicità',
};
