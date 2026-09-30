import type { CounterProposalRejectionEmailTemplate } from './types';

export const counterProposalRejectionNl: CounterProposalRejectionEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `Over uw voorstel — ${advertiserName} (${proposalNumber})`,
  greeting: (contactFirstName) => `Beste ${contactFirstName},`,
  intro:
    'We hebben de wijzigingen bekeken die u heeft voorgesteld voor ons zichtbaarheidsvoorstel en kunnen deze, na overweging, niet zo accepteren.',
  reasonIntro: 'Reden:',
  closingLine: 'We staan tot uw beschikking om verder in gesprek te gaan en een formule te vinden die voor beide partijen werkt.',
  signOff: 'Met vriendelijke groet,',
  department: 'Advertising',
};
