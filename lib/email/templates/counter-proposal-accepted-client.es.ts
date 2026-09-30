import type { CounterProposalAcceptedClientEmailTemplate } from './types';

export const counterProposalAcceptedClientEs: CounterProposalAcceptedClientEmailTemplate = {
  subject: (proposalNumber) => `Hemos aceptado tu propuesta — ${proposalNumber}`,
  greeting: (contactFirstName) => `Hola ${contactFirstName}:`,
  body: 'Hemos revisado los cambios que propusiste y los aceptamos. Nos pondremos en contacto contigo en breve para los siguientes pasos.',
  closingLine: 'Gracias por tu tiempo y por seguir adelante con nosotros.',
  signOff: 'Un saludo,',
  department: 'Publicidad',
};
