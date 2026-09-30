import type { ContentLanguage } from '../../domain';
import type {
  CounterProposalAcceptedClientEmailTemplate,
  CounterProposalReceivedAmEmailTemplate,
  CounterProposalRejectionEmailTemplate,
  CounterProposalSubmittedClientEmailTemplate,
  ProposalEmailTemplate,
} from './types';
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
import { counterProposalReceivedAmEs } from './counter-proposal-received-am.es';
import { counterProposalReceivedAmFr } from './counter-proposal-received-am.fr';
import { counterProposalReceivedAmEn } from './counter-proposal-received-am.en';
import { counterProposalAcceptedClientEs } from './counter-proposal-accepted-client.es';
import { counterProposalAcceptedClientEn } from './counter-proposal-accepted-client.en';
import { counterProposalAcceptedClientFr } from './counter-proposal-accepted-client.fr';
import { counterProposalAcceptedClientIt } from './counter-proposal-accepted-client.it';
import { counterProposalAcceptedClientNl } from './counter-proposal-accepted-client.nl';
import { counterProposalSubmittedClientEs } from './counter-proposal-submitted-client.es';
import { counterProposalSubmittedClientEn } from './counter-proposal-submitted-client.en';
import { counterProposalSubmittedClientFr } from './counter-proposal-submitted-client.fr';
import { counterProposalSubmittedClientIt } from './counter-proposal-submitted-client.it';
import { counterProposalSubmittedClientNl } from './counter-proposal-submitted-client.nl';

export type {
  ProposalEmailTemplate,
  CounterProposalRejectionEmailTemplate,
  CounterProposalReceivedAmEmailTemplate,
  CounterProposalAcceptedClientEmailTemplate,
  CounterProposalSubmittedClientEmailTemplate,
} from './types';

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

// Email 5 (ronda 17, bloque 1, punto 1): interno, para el advertising
// manager — solo ES/FR/EN tienen fichero propio, los tres idiomas de la
// interfaz interna (`lib/i18n-internal.tsx`). IT/NL nunca se seleccionan
// aquí (`profiles.preferred_language` solo admite ES/FR/EN, ronda 17,
// bloque 3), así que se cae a ES —no a EN— para cualquier otro valor: es
// el idioma por defecto de la interfaz interna, no el de cara al cliente.
const COUNTER_PROPOSAL_RECEIVED_AM_TEMPLATES: Record<'ES' | 'FR' | 'EN', CounterProposalReceivedAmEmailTemplate> = {
  ES: counterProposalReceivedAmEs,
  FR: counterProposalReceivedAmFr,
  EN: counterProposalReceivedAmEn,
};

export function getCounterProposalReceivedAmEmailTemplate(language: string): CounterProposalReceivedAmEmailTemplate {
  return (
    COUNTER_PROPOSAL_RECEIVED_AM_TEMPLATES[language as 'ES' | 'FR' | 'EN'] ?? counterProposalReceivedAmEs
  );
}

// Email 6 (ronda 17, bloque 1, punto 2): de cara al cliente, 5 idiomas.
const COUNTER_PROPOSAL_ACCEPTED_CLIENT_TEMPLATES: Record<ContentLanguage, CounterProposalAcceptedClientEmailTemplate> = {
  ES: counterProposalAcceptedClientEs,
  EN: counterProposalAcceptedClientEn,
  FR: counterProposalAcceptedClientFr,
  IT: counterProposalAcceptedClientIt,
  NL: counterProposalAcceptedClientNl,
};

export function getCounterProposalAcceptedClientEmailTemplate(
  language: string,
): CounterProposalAcceptedClientEmailTemplate {
  return (
    COUNTER_PROPOSAL_ACCEPTED_CLIENT_TEMPLATES[language as ContentLanguage] ?? counterProposalAcceptedClientEn
  );
}

// Email 9 (ronda 17, bloque 1, punto 3): de cara al cliente, 5 idiomas.
const COUNTER_PROPOSAL_SUBMITTED_CLIENT_TEMPLATES: Record<ContentLanguage, CounterProposalSubmittedClientEmailTemplate> = {
  ES: counterProposalSubmittedClientEs,
  EN: counterProposalSubmittedClientEn,
  FR: counterProposalSubmittedClientFr,
  IT: counterProposalSubmittedClientIt,
  NL: counterProposalSubmittedClientNl,
};

export function getCounterProposalSubmittedClientEmailTemplate(
  language: string,
): CounterProposalSubmittedClientEmailTemplate {
  return (
    COUNTER_PROPOSAL_SUBMITTED_CLIENT_TEMPLATES[language as ContentLanguage] ?? counterProposalSubmittedClientEn
  );
}
