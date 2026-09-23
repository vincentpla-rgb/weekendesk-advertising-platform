import type { ProposalEmailTemplate } from './types';

export const proposalEmailEs: ProposalEmailTemplate = {
  subject: (advertiserName) => `Propuesta de visibilidad Weekendesk — ${advertiserName}`,
  greeting: (contactFirstName) => `Hola ${contactFirstName}:`,
  optionsLine: (n) =>
    n === 1
      ? 'A continuación encontrarás nuestra propuesta, con 1 fórmula entre la que elegir. Cada una detalla los soportes incluidos, los mercados y los periodos de difusión.'
      : `A continuación encontrarás nuestra propuesta, con ${n} fórmulas entre las que elegir. Cada una detalla los soportes incluidos, los mercados y los periodos de difusión.`,
  cta: 'Ver la propuesta',
  referenceLine: (proposalNumber) => `Referencia: ${proposalNumber}`,
  postCtaLine: 'Desde la misma página puedes aceptar la fórmula que prefieras o enviarnos tus comentarios.',
  validityLine: (expiryDate) => `La propuesta es válida hasta el ${expiryDate}.`,
  closingLine: 'Quedo a tu disposición para cualquier consulta.',
  signOff: 'Un saludo,',
  department: 'Publicidad',
  dateLocale: 'es-ES',
};
