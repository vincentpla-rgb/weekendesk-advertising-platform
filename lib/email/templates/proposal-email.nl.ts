import type { ProposalEmailTemplate } from './types';

export const proposalEmailNl: ProposalEmailTemplate = {
  subject: (advertiserName) => `Zichtbaarheidsvoorstel Weekendesk — ${advertiserName}`,
  greeting: (contactFirstName) => `Beste ${contactFirstName},`,
  optionsLine: (n) =>
    `Hieronder vindt u ons voorstel met ${n} formule${n === 1 ? '' : 's'} om uit te kiezen. Bij elke formule staan de opgenomen kanalen, de betrokken markten en de looptijd vermeld.`,
  cta: 'Bekijk het voorstel',
  referenceLine: (proposalNumber) => `Referentie: ${proposalNumber}`,
  postCtaLine: 'Op dezelfde pagina kunt u de gewenste formule aanvaarden of ons uw opmerkingen bezorgen.',
  validityLine: (expiryDate) => `Dit voorstel is geldig tot ${expiryDate}.`,
  closingLine: 'Ik sta tot uw beschikking voor verdere vragen.',
  signOff: 'Met vriendelijke groet,',
  department: 'Advertising',
  dateLocale: 'nl-NL',
};
