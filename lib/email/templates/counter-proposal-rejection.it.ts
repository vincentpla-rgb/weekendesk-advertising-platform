import type { CounterProposalRejectionEmailTemplate } from './types';

export const counterProposalRejectionIt: CounterProposalRejectionEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `Sulla tua proposta — ${advertiserName} (${proposalNumber})`,
  greeting: (contactFirstName) => `Gentile ${contactFirstName},`,
  intro:
    'Abbiamo esaminato le modifiche che hai proposto alla nostra proposta di visibilità e, dopo averle valutate, non possiamo accettarle così come sono state formulate.',
  reasonIntro: 'Motivo:',
  closingLine: 'Restiamo a disposizione per continuare a confrontarci e trovare una soluzione che vada bene per entrambe le parti.',
  signOff: 'Cordiali saluti,',
  department: 'Pubblicità',
};
