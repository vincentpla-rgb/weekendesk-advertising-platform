import type { CounterProposalAcceptedClientEmailTemplate } from './types';

export const counterProposalAcceptedClientNl: CounterProposalAcceptedClientEmailTemplate = {
  subject: (proposalNumber) => `We hebben uw voorstel geaccepteerd — ${proposalNumber}`,
  greeting: (contactFirstName) => `Beste ${contactFirstName},`,
  body: 'We hebben de wijzigingen die u heeft voorgesteld bekeken en accepteren ze. We nemen binnenkort contact met u op voor de volgende stappen.',
  closingLine: 'Bedankt voor uw tijd en om met ons verder te gaan.',
  signOff: 'Met vriendelijke groet,',
  department: 'Advertising',
};
