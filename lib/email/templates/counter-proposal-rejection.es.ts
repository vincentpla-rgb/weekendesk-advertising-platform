import type { CounterProposalRejectionEmailTemplate } from './types';

export const counterProposalRejectionEs: CounterProposalRejectionEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `Sobre tu propuesta — ${advertiserName} (${proposalNumber})`,
  greeting: (contactFirstName) => `Hola ${contactFirstName}:`,
  intro:
    'Hemos revisado los cambios que propusiste sobre nuestra propuesta de visibilidad y, tras valorarlo, no podemos aceptarlos tal como están planteados.',
  reasonIntro: 'Motivo:',
  closingLine: 'Quedamos a tu disposición para seguir hablando y buscar una fórmula que funcione para ambas partes.',
  signOff: 'Un saludo,',
  department: 'Publicidad',
};
