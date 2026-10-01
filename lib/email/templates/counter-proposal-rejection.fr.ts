import type { CounterProposalRejectionEmailTemplate } from './types';

export const counterProposalRejectionFr: CounterProposalRejectionEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `À propos de votre devis — ${advertiserName} (${proposalNumber})`,
  greeting: (contactFirstName) => `Bonjour ${contactFirstName},`,
  intro:
    "Nous avons examiné les modifications que vous avez proposées pour notre proposition de visibilité et, après réflexion, nous ne pouvons pas les accepter telles quelles.",
  reasonIntro: 'Motif :',
  closingLine: 'Nous restons à votre disposition pour continuer à échanger et trouver une formule qui convienne aux deux parties.',
  signOff: 'Bien cordialement,',
  department: 'Régie publicitaire',
};
