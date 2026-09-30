import type { CounterProposalSubmittedClientEmailTemplate } from './types';

export const counterProposalSubmittedClientNl: CounterProposalSubmittedClientEmailTemplate = {
  subject: (proposalNumber) => `We hebben uw voorstel ontvangen — ${proposalNumber}`,
  greeting: (contactFirstName) => `Beste ${contactFirstName},`,
  body: 'We hebben de wijzigingen die u heeft voorgesteld ontvangen en bekijken deze binnenkort. We nemen contact met u op met onze reactie.',
  closingLine: 'Bedankt voor uw tijd.',
  signOff: 'Met vriendelijke groet,',
  department: 'Advertising',
};
