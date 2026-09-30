import type { CounterProposalAcceptedClientEmailTemplate } from './types';

export const counterProposalAcceptedClientIt: CounterProposalAcceptedClientEmailTemplate = {
  subject: (proposalNumber) => `Abbiamo accettato la tua proposta — ${proposalNumber}`,
  greeting: (contactFirstName) => `Gentile ${contactFirstName},`,
  body: 'Abbiamo esaminato le modifiche che hai proposto e le accettiamo. Ti ricontatteremo a breve per i prossimi passi.',
  closingLine: 'Grazie per il tuo tempo e per proseguire con noi.',
  signOff: 'Cordiali saluti,',
  department: 'Pubblicità',
};
