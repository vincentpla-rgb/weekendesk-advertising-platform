import type { ProposalEmailTemplate } from './types';

export const proposalEmailEn: ProposalEmailTemplate = {
  subject: (advertiserName) => `Weekendesk visibility proposal — ${advertiserName}`,
  greeting: (contactFirstName) => `Dear ${contactFirstName},`,
  optionsLine: (n) =>
    `Below you will find our proposal, setting out ${n} package${n === 1 ? '' : 's'} to choose from. Each one lists the placements included, the markets covered and the campaign periods.`,
  cta: 'View the proposal',
  referenceLine: (proposalNumber) => `Reference: ${proposalNumber}`,
  postCtaLine: 'You can accept your preferred package or send us your comments directly from the page.',
  validityLine: (expiryDate) => `This proposal is valid until ${expiryDate}.`,
  closingLine: 'I remain available should you have any questions.',
  signOff: 'Kind regards,',
  department: 'Advertising',
  dateLocale: 'en-GB',
};
