import type { ProposalEmailTemplate } from './types';

export const proposalEmailIt: ProposalEmailTemplate = {
  subject: (advertiserName) => `Proposta di visibilità Weekendesk — ${advertiserName}`,
  greeting: (contactFirstName) => `Gentile ${contactFirstName},`,
  optionsLine: (n) =>
    `Di seguito trova la nostra proposta, che presenta ${n} formul${n === 1 ? 'a' : 'e'} tra cui scegliere. Ciascuna indica i supporti previsti, i mercati interessati e i periodi di diffusione.`,
  cta: 'Consulta la proposta',
  referenceLine: (proposalNumber) => `Riferimento: ${proposalNumber}`,
  postCtaLine: 'Dalla stessa pagina può accettare la formula che preferisce oppure inviarci le sue osservazioni.',
  validityLine: (expiryDate) => `La proposta è valida fino al ${expiryDate}.`,
  closingLine: 'Resto a disposizione per qualsiasi chiarimento.',
  signOff: 'Cordiali saluti,',
  department: 'Pubblicità',
  dateLocale: 'it-IT',
};
