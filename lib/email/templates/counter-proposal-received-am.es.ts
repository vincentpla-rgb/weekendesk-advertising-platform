import type { CounterProposalReceivedAmEmailTemplate } from './types';

export const counterProposalReceivedAmEs: CounterProposalReceivedAmEmailTemplate = {
  subject: (advertiserName, proposalNumber) => `Nueva contrapropuesta — ${advertiserName} (${proposalNumber})`,
  greeting: (ownerFirstName) => `Hola ${ownerFirstName}:`,
  body: (advertiserName, optionCode) =>
    `${advertiserName} ha propuesto cambios sobre la opción ${optionCode}. Puedes revisarla y decidir desde el detalle del presupuesto.`,
  cta: 'Revisar contrapropuesta',
  department: 'Publicidad',
};
