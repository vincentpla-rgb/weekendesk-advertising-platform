import type { ProposalEmailTemplate } from './types';

export const proposalEmailFr: ProposalEmailTemplate = {
  subject: (advertiserName) => `Proposition de visibilité Weekendesk — ${advertiserName}`,
  greeting: (contactFirstName) => `Bonjour ${contactFirstName},`,
  optionsLine: (n) =>
    `Vous trouverez ci-dessous notre proposition, qui présente ${n} formule${n === 1 ? '' : 's'} au choix. Chacune détaille les supports retenus, les marchés concernés et les périodes de diffusion.`,
  cta: 'Consulter la proposition',
  referenceLine: (proposalNumber) => `Référence : ${proposalNumber}`,
  postCtaLine:
    'Vous pouvez y accepter la formule qui vous convient ou nous faire part de vos remarques directement depuis la page.',
  validityLine: (expiryDate) => `Cette proposition est valable jusqu'au ${expiryDate}.`,
  closingLine: 'Je reste à votre disposition pour en échanger.',
  signOff: 'Bien cordialement,',
  department: 'Régie publicitaire',
  dateLocale: 'fr-FR',
};
