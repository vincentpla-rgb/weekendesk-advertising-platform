import type { ContentLanguage } from '../../domain';
import type { ProposalEmailTemplate } from './types';
import { proposalEmailEs } from './proposal-email.es';
import { proposalEmailEn } from './proposal-email.en';
import { proposalEmailFr } from './proposal-email.fr';
import { proposalEmailIt } from './proposal-email.it';
import { proposalEmailNl } from './proposal-email.nl';

export type { ProposalEmailTemplate } from './types';

const PROPOSAL_EMAIL_TEMPLATES: Record<ContentLanguage, ProposalEmailTemplate> = {
  ES: proposalEmailEs,
  EN: proposalEmailEn,
  FR: proposalEmailFr,
  IT: proposalEmailIt,
  NL: proposalEmailNl,
};

/** Selecciona la plantilla por idioma del cliente. Cae a inglés si el valor no es uno de los cinco soportados. */
export function getProposalEmailTemplate(language: string): ProposalEmailTemplate {
  return PROPOSAL_EMAIL_TEMPLATES[language as ContentLanguage] ?? proposalEmailEn;
}
