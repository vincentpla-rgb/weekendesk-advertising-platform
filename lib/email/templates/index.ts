import type { ContentLanguage } from '../../domain';
import type { CounterProposalRejectionEmailTemplate, ProposalEmailTemplate } from './types';
import { proposalEmailEs } from './proposal-email.es';
import { proposalEmailEn } from './proposal-email.en';
import { proposalEmailFr } from './proposal-email.fr';
import { proposalEmailIt } from './proposal-email.it';
import { proposalEmailNl } from './proposal-email.nl';
import { counterProposalRejectionEs } from './counter-proposal-rejection.es';
import { counterProposalRejectionEn } from './counter-proposal-rejection.en';
import { counterProposalRejectionFr } from './counter-proposal-rejection.fr';
import { counterProposalRejectionIt } from './counter-proposal-rejection.it';
import { counterProposalRejectionNl } from './counter-proposal-rejection.nl';

export type { ProposalEmailTemplate, CounterProposalRejectionEmailTemplate } from './types';

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

const COUNTER_PROPOSAL_REJECTION_TEMPLATES: Record<ContentLanguage, CounterProposalRejectionEmailTemplate> = {
  ES: counterProposalRejectionEs,
  EN: counterProposalRejectionEn,
  FR: counterProposalRejectionFr,
  IT: counterProposalRejectionIt,
  NL: counterProposalRejectionNl,
};

/** CLAUDE.md, ronda 16, bloque 4. Cae a inglés si el valor no es uno de los cinco soportados. */
export function getCounterProposalRejectionEmailTemplate(language: string): CounterProposalRejectionEmailTemplate {
  return COUNTER_PROPOSAL_REJECTION_TEMPLATES[language as ContentLanguage] ?? counterProposalRejectionEn;
}
