import type { CounterProposalSubmittedClientEmailTemplate } from './types';

export const counterProposalSubmittedClientEs: CounterProposalSubmittedClientEmailTemplate = {
  subject: (proposalNumber) => `Hemos recibido tu propuesta — ${proposalNumber}`,
  greeting: (contactFirstName) => `Hola ${contactFirstName}:`,
  body: 'Hemos recibido los cambios que propusiste y los revisaremos en breve. Nos pondremos en contacto contigo con nuestra respuesta.',
  closingLine: 'Gracias por tu tiempo.',
  signOff: 'Un saludo,',
  department: 'Publicidad',
};
