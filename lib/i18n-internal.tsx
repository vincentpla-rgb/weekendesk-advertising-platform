'use client';

/**
 * Interfaz interna en varios idiomas (CLAUDE.md §2, ronda 2 de correcciones).
 *
 * Distinto de `lib/i18n.ts`: aquello es el idioma DEL CLIENTE (pantalla
 * pública + email, elegido por presupuesto, CLAUDE.md §5.6/§6). Esto es el
 * idioma DEL COMERCIAL usando la aplicación — una preferencia personal de
 * navegador, sin efecto en ningún dato que vea el cliente.
 *
 * Guardado en `localStorage` (por dispositivo, nunca en la base de datos):
 * es una conveniencia de interfaz, no un dato de negocio.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type InternalLanguage = 'ES' | 'FR' | 'EN';

export const INTERNAL_LANGUAGES: readonly InternalLanguage[] = ['ES', 'FR', 'EN'];

export const INTERNAL_LANGUAGE_LABELS: Record<InternalLanguage, string> = {
  ES: 'Español',
  FR: 'Français',
  EN: 'English',
};

const STORAGE_KEY = 'wk-internal-language';

// -----------------------------------------------------------------------------
// Diccionario. Claves planas con puntos ("sección.campo") para no anidar
// objetos de traducción en cada componente.
// -----------------------------------------------------------------------------

const es = {
  'app.title': 'Weekendesk Advertising',
  'header.signOut': 'Salir',

  'login.subtitle': 'Acceso solo para el equipo. Introduce tu email y contraseña de Weekendesk.',
  'login.email': 'Email',
  'login.password': 'Contraseña',
  'login.submit': 'Entrar',
  'login.submitting': 'Entrando…',
  'login.noAccount': '¿No tienes cuenta? Pide a Vincent que te la cree.',
  'login.adminLink': 'Gestionar usuarios del equipo',

  'nav.newProposal': 'Nuevo presupuesto',
  'nav.accountsList': 'Cuentas',
  'nav.admin': 'Usuarios',
  'nav.dashboard': 'Panel',
  'nav.targets': 'Objetivos',

  'targets.title': 'Objetivos por advertising manager',
  'targets.fiscalYear': 'Año fiscal {year}',
  'targets.am': 'Advertising manager',
  'targets.q1': 'Q1 (may-jul)',
  'targets.q2': 'Q2 (ago-oct)',
  'targets.q3': 'Q3 (nov-ene)',
  'targets.q4': 'Q4 (feb-abr)',
  'targets.save': 'Guardar',
  'targets.saving': 'Guardando…',
  'targets.saved': 'Guardado',
  'targets.note': 'Objetivo medido sobre el importe neto de medios (fees de gestión), nunca sobre el total facturado — el presupuesto de medios que pasa por Weekendesk sin margen no cuenta para el objetivo (CLAUDE.md §4.4).',

  'dashboard.title': 'Panel de seguimiento',
  'dashboard.objective': 'Objetivo del periodo',
  'dashboard.wholeYear': 'Año completo',
  'dashboard.allAms': 'Todos los AM',
  'dashboard.kpiBilled': 'Facturado (neto de medios)',
  'dashboard.kpiTarget': 'Objetivo',
  'dashboard.kpiProgress': 'Progreso',
  'dashboard.kpiAvgMargin': 'Margen medio',
  'dashboard.optionsWithoutMarginNote': '{count} aceptación(es) por contrapropuesta sin margen calculable, excluidas',
  'dashboard.kpiPendingCounter': 'Contrapropuestas pendientes',
  'dashboard.kpiExpiringSoon': 'A punto de caducar',
  'dashboard.byMarket': 'Por mercado',
  'dashboard.byAm': 'Por advertising manager',
  'dashboard.breakdownToggle': 'Ver desglose por mercado y AM',
  'dashboard.filterMarket': 'Mercado',
  'dashboard.filterSupport': 'Soporte',
  'dashboard.filterAccount': 'Cliente',
  'dashboard.filterAccountPlaceholder': 'Buscar por razón social…',
  'dashboard.filterProposalNumber': 'N.º de presupuesto',
  'dashboard.filterProposalNumberPlaceholder': 'Ej. 2026-014',
  'dashboard.filterDateFrom': 'Desde',
  'dashboard.filterDateTo': 'Hasta',
  'dashboard.filterAmountMin': 'Importe mín. (€)',
  'dashboard.filterAmountMax': 'Importe máx. (€)',
  'dashboard.togglePendingCounter': 'Solo contrapropuesta pendiente',
  'dashboard.toggleExpiringSoon': 'Solo a punto de caducar',
  'dashboard.all': 'Todos',
  'dashboard.resultsCount': 'Mostrando {shown} de {total} presupuestos',
  'dashboard.colAmount': 'Importe',
  'dashboard.colMarkets': 'Mercados',

  'admin.title': 'Usuarios del equipo',
  'admin.fullName': 'Nombre completo',
  'admin.email': 'Email',
  'admin.password': 'Contraseña inicial',
  'admin.generatePassword': 'Generar',
  'admin.passwordNote': 'De un solo uso: la persona deberá cambiarla la primera vez que entre.',
  'admin.inviteLanguage': 'Idioma de invitación',
  'admin.note': 'Nota (opcional)',
  'admin.create': 'Crear acceso',
  'admin.creating': 'Creando…',
  'admin.existingTitle': 'Lista blanca actual',
  'admin.colEmail': 'Email',
  'admin.colName': 'Nombre',
  'admin.colStatus': 'Estado',
  'admin.statusActive': 'Ha entrado',
  'admin.statusPending': 'Aún no ha entrado',
  'admin.remove': 'Quitar acceso',
  'admin.createdPasswordNotice':
    'Contraseña inicial creada. Compártela con la persona por un canal seguro (no por email): no se puede volver a ver.',
  'admin.onlyAllowedEmailNotice':
    'Este email ya estaba en la lista blanca pero sin usuario de Supabase Auth: se ha creado el acceso ahora.',

  'changePassword.title': 'Define tu nueva contraseña',
  'changePassword.subtitle':
    'Por seguridad, antes de continuar tienes que cambiar la contraseña inicial que te dieron.',
  'changePassword.newPassword': 'Nueva contraseña',
  'changePassword.confirmPassword': 'Repite la contraseña',
  'changePassword.submit': 'Guardar y continuar',
  'changePassword.submitting': 'Guardando…',
  'changePassword.mismatchError': 'Las contraseñas no coinciden.',

  'proposalBuilder.title': 'Nuevo presupuesto',
  'proposalBuilder.accountAndContact': 'Cuenta y contacto',
  'proposalBuilder.account': 'Cuenta',
  'proposalBuilder.newAccount': '+ Nueva cuenta',
  'proposalBuilder.legalName': 'Razón social',
  'proposalBuilder.country': 'País',
  'proposalBuilder.contact': 'Contacto',
  'proposalBuilder.newContact': '+ Nuevo contacto',
  'proposalBuilder.contactFullName': 'Nombre y apellidos',
  'proposalBuilder.contactEmail': 'Email',
  'proposalBuilder.shipment': 'Envío',
  'proposalBuilder.clientLanguage': 'Idioma del cliente',
  'proposalBuilder.clientLanguageHelp':
    'Determina el idioma de la pantalla pública y del email que recibe el cliente.',
  'proposalBuilder.brief': 'Brief de campaña',
  'proposalBuilder.briefPlaceholder': 'Qué busca el cliente, temporada, destino…',
  'proposalBuilder.option': 'Opción',
  'proposalBuilder.remove': 'Quitar',
  'proposalBuilder.optionName': 'Nombre de la opción (ej. Entrada, Amplia, Premium)',
  'proposalBuilder.optionPitch': 'Frase de opción: lógica estratégica en 1-2 líneas',
  'proposalBuilder.markets': 'Mercados de la opción',
  'proposalBuilder.marketsHelp':
    'Se eligen una vez para toda la opción: todos los soportes se venden automáticamente en todos ellos.',
  'market.FR': 'Francia',
  'market.ES': 'España',
  'market.IT': 'Italia',
  'market.BE_FR': 'Bélgica (FR)',
  'market.BE_NL': 'Bélgica (NL)',
  'market.NL': 'Países Bajos',
  'proposalBuilder.scheduleMode': 'Periodo de campaña',
  'proposalBuilder.scheduleDates': 'Fechas concretas',
  'proposalBuilder.scheduleDurationOnly': 'Solo duración (sin fechas)',
  'proposalBuilder.campaignStart': 'Inicio de campaña',
  'proposalBuilder.campaignEnd': 'Fin de campaña',
  'proposalBuilder.durationCount': 'Duración',
  'proposalBuilder.durationUnitWeek': 'semanas',
  'proposalBuilder.durationUnitMonth': 'meses',
  'proposalBuilder.durationOnlyWarning':
    'Sin fecha de inicio concreta no se puede comprobar la antelación mínima de cada soporte.',
  'proposalBuilder.support': 'Soporte',
  'proposalBuilder.quantity': 'Cant.',
  'proposalBuilder.media': 'Medios',
  'proposalBuilder.mediaBudgetLabel': 'Presupuesto de medios (€)',
  'proposalBuilder.mediaBudgetPlaceholder': '€ medios',
  'proposalBuilder.mediaBudgetRequired': 'Obligatorio',
  'proposalBuilder.mediaMonthsAutoLabel': 'Meses (según duración)',
  'proposalBuilder.mediaMonthsAutoHint':
    'Se calcula solo a partir de la duración de la opción — no es un campo editable.',
  'proposalBuilder.forceMediaFee': 'Forzar fee de gestión a mano',
  'proposalBuilder.manualFeeLabel': 'Fee de gestión (€)',
  'proposalBuilder.manualFeeReasonLabel': 'Motivo (obligatorio)',
  'proposalBuilder.influencerAmountLabel': 'Importe para el influencer (€)',
  'proposalBuilder.mediaSplitRequired': 'El reparto nunca es automático: confírmalo a mano.',
  'proposalBuilder.mediaFeeLabel': 'Fee',
  'proposalBuilder.mediaRealSpendLabel': 'Real al medio',
  'proposalBuilder.mediaFeeExceedsBudget': 'el presupuesto no cubre el mínimo de gestión',
  'proposalBuilder.notSellableIn': 'No vendible en',
  'proposalBuilder.availabilityNotice': 'Confirmar disponibilidad con Marketing antes de contratar.',
  'proposalBuilder.addLine': '+ Añadir línea',
  'proposalBuilder.manualDiscounts': 'Descuentos manuales',
  'proposalBuilder.discountReason': 'Motivo (obligatorio)',
  'proposalBuilder.addDiscount': '+ Añadir descuento',
  'proposalBuilder.disableVolumeDiscount': 'Desactivar el descuento automático por volumen',
  'proposalBuilder.disableVolumeDiscountHelp':
    'La tarifa bruta se factura sin ningún descuento por tramo, aunque supere el umbral. Los descuentos manuales, si los hay, se siguen aplicando aparte. Se registra con autor y fecha.',
  'proposalBuilder.addOption': '+ Añadir opción',
  'proposalBuilder.editTitle': 'Editar presupuesto {number}',
  'proposalBuilder.editUnavailable':
    'El presupuesto que querías editar ya no está disponible (no existe, o ya se envió con éxito). Puedes crear uno nuevo desde aquí.',
  'proposalBuilder.draftReplacedNotice': 'El borrador anterior se ha sustituido por este envío.',
  'proposalBuilder.preSendChecks': 'Controles previos al envío',
  'proposalBuilder.internalCost': 'Coste interno',
  'proposalBuilder.grossFee': 'Tarifa bruta (neta de medios)',
  'proposalBuilder.netRevenue': 'Importe neto de medios',
  'proposalBuilder.mediaBudget': 'Presupuesto de medios',
  'proposalBuilder.billedTotal': 'Importe facturado',
  'proposalBuilder.margin': 'Margen',
  'proposalBuilder.save': 'Guardar',
  'proposalBuilder.saving': 'Guardando…',
  'proposalBuilder.send': 'Enviar al cliente',
  'proposalBuilder.sending': 'Enviando…',
  'proposalBuilder.sentTitle': 'Envío enviado',
  'proposalBuilder.sentBody': 'El envío está congelado y el email ya ha salido a {email}, con copia a ti y a contracting@weekendesk.fr. Ningún cambio posterior lo altera.',
  'proposalBuilder.viewPublic': 'Ver pantalla pública',
  'proposalBuilder.applyDuration': 'Usar duración',
  'proposalBuilder.autoQuantityHint': 'Automático según duración',
  'proposalBuilder.quantityHelpOn': 'Presente de forma continua durante todo el periodo, no un número de veces.',
  'proposalBuilder.quantityHelpCrm': 'Número de envíos distintos durante el periodo (p. ej. 2 = dos newsletters).',
  'proposalBuilder.quantityHelpSoc': 'Número de publicaciones/historias durante el periodo.',
  'proposalBuilder.viewProposal': 'Ver presupuesto enviado',
  'proposalBuilder.createAnother': 'Crear otro presupuesto',
  'proposalBuilder.previewEmailModalTitle': 'Vista previa del email',
  'proposalBuilder.previewEmailSubject': 'Asunto',
  'proposalBuilder.previewEmailTabHtml': 'HTML',
  'proposalBuilder.previewEmailTabText': 'Texto plano',
  'proposalBuilder.previewEmailClose': 'Cerrar',
  'proposalBuilder.previewNeedsData':
    'Rellena al menos la razón social y el nombre del contacto para ver la vista previa.',
  'proposalBuilder.previewPdf': 'Vista previa del presupuesto',
  'proposalBuilder.previewPdfLoading': 'Generando…',
  'proposalBuilder.previewPdfError': 'No se ha podido generar la vista previa del PDF.',

  'checklist.allPass': 'Todos los controles previos al envío pasan.',
  'checklist.blocks': 'Bloquea el envío',
  'checklist.warning': 'Aviso',
  'checklist.marginBelowFloor': 'Opción {option}: margen del {rate} %, por debajo del {min} % exigido.',
  'checklist.calculationError':
    'Opción {option}: no se puede calcular el margen — hay un dato inválido en una de sus líneas (ver el aviso en la propia opción). Corrígelo para poder evaluar esta opción.',
  'checklist.campaignDatesInvalid':
    'Opción {option}: la fecha de fin de campaña no puede ser anterior a la de inicio.',
  'checklist.leadTimeInsufficient':
    '{support} en {market}: quedan {available} días laborables hasta el inicio (descontando festivos de {market}) y el soporte exige {required}.',
  'checklist.leadTimeForced': '{support} en {market}: antelación insuficiente, forzada — motivo: {reason}',
  'checklist.supportNotSellable': '{support} no es vendible en {market}.',
  'checklist.mediaBudgetMissing':
    '{support}: falta el presupuesto de medios (€). Es obligatorio para calcular el fee de gestión.',
  'checklist.mediaFeeExceedsBudget':
    '{support}: el presupuesto de medios del cliente no cubre el mínimo de gestión (faltan {amount} €). Fuerza el reparto a mano o sube el presupuesto.',
  'checklist.mediaSplitRequired':
    '{support}: el reparto entre el importe para el medio real y el fee de gestión nunca es automático. Confírmalo a mano antes de enviar.',
  'checklist.emptyBrief':
    'El brief de campaña está vacío. Se reutiliza en el email y, más adelante, en el PDF.',
  'checklist.forceLeadTime': 'Forzar antelación',
  'checklist.forceLeadTimeReasonLabel': 'Motivo (obligatorio)',
  'checklist.forceLeadTimeConfirm': 'Confirmar',
  'checklist.forceLeadTimeCancel': 'Cancelar',

  'pricingError.quantityNotPositive': '{support}: la cantidad debe ser mayor que cero.',
  'pricingError.mediaBudgetMissing': '{support}: falta el presupuesto de medios.',
  'pricingError.mediaBudgetInvalid': '{support}: el presupuesto de medios debe ser un número válido.',
  'pricingError.mediaMonthsInvalid': '{support}: los meses del fee mínimo deben ser un número válido.',
  'pricingError.manualFeeInvalid': '{support}: el importe para el influencer debe ser un número válido.',
  'pricingError.manualFeeReasonRequired': '{support}: falta el motivo del reparto forzado.',
  'pricingError.notMediaBuySupport': '{support}: este soporte no admite reparto de medios.',
  'pricingError.unknownSupport': '{support}: soporte desconocido.',
  'pricingError.duplicateSupportInOption': '{support}: este soporte ya está en la opción.',
  'pricingError.noMarketSelected': 'Elige al menos un mercado para esta opción.',
  'pricingError.noCoefficientForMarket': 'Falta el coeficiente de precio para {market}.',
  'pricingError.manualDiscountReasonRequired': 'Falta el motivo del descuento manual.',
  'pricingError.manualDiscountOutOfRange': 'El descuento manual ({rate} %) está fuera del rango permitido.',
  'pricingError.generic': 'No se ha podido calcular esta opción: revisa los datos de sus líneas.',

  'discountBanner.nominal': 'Descuento nominal',
  'discountBanner.effective': 'Descuento efectivo',
  'discountBanner.none': 'Sin descuento aplicado.',
  'discountBanner.floorAbsorbs': 'El suelo de margen absorbe {amount}',

  'status.DRAFT': 'Borrador',
  'status.SENT': 'Enviado',
  'status.VIEWED': 'Visto',
  'status.ACCEPTED': 'Aceptado',
  'status.REJECTED': 'Rechazado',
  'status.EXPIRED': 'Caducado',
  'status.COUNTERED': 'Contrapropuesta recibida',

  'proposalsList.title': 'Presupuestos',
  'proposalsList.filterStatus': 'Estado',
  'proposalsList.filterStatusAll': 'Todos',
  'proposalsList.filterOwner': 'Creador',
  'proposalsList.filterOwnerAll': 'Todos',
  'proposalsList.colNumber': 'Número',
  'proposalsList.colAccount': 'Cuenta',
  'proposalsList.colContact': 'Contacto',
  'proposalsList.colStatus': 'Estado',
  'proposalsList.colUpdated': 'Última modificación',
  'proposalsList.colOwner': 'Creador',
  'proposalsList.empty': 'No hay presupuestos con estos filtros.',

  'proposalDetail.title': 'Presupuesto',
  'proposalDetail.back': '← Volver al dashboard',
  'proposalDetail.draftNotice':
    'Este presupuesto se calculó y quedó guardado, pero el email nunca llegó a salir. El cliente no lo ha visto.',
  'proposalDetail.sendButton': 'Enviar',
  'proposalDetail.sending': 'Enviando…',
  'proposalDetail.retrySuccess': 'Email enviado. El presupuesto ya está marcado como enviado.',
  'proposalDetail.downloadPdf': 'Descargar PDF',
  'proposalDetail.duplicateButton': 'Duplicar',
  'proposalDetail.editButton': 'Editar',
  'proposalDetail.duplicating': 'Duplicando…',
  'proposalDetail.publicLink': 'Enlace público',
  'proposalDetail.sentAt': 'Enviado el',
  'proposalDetail.decidedAt': 'Decidido el',
  'proposalDetail.option': 'Opción',
  'proposalDetail.lineMarket': 'Mercado',
  'proposalDetail.notFound': 'Presupuesto no encontrado.',
  'proposalDetail.leadTimeForced': 'Antelación forzada',
  'proposalDetail.leadTimeForcedReason': 'Motivo: {reason}',

  'accountsList.title': 'Cuentas',
  'accountsList.colLegalName': 'Razón social',
  'accountsList.colCountry': 'País',
  'accountsList.colContacts': 'Contactos',
  'accountsList.colProposals': 'Presupuestos',
  'accountsList.empty': 'No hay cuentas todavía.',

  'accountDetail.title': 'Cuenta',
  'accountDetail.back': '← Volver a cuentas',
  'accountDetail.contacts': 'Contactos',
  'accountDetail.proposals': 'Historial de presupuestos',
  'accountDetail.noProposals': 'Esta cuenta no tiene presupuestos todavía.',

  // Contrapropuesta editable del cliente + revisión interna (CLAUDE.md, ronda 16).
  'counterProposal.title': 'Contrapropuesta del cliente',
  'counterProposal.submittedAt': 'Recibida el',
  'counterProposal.statusPending': 'Pendiente de revisión',
  'counterProposal.statusAccepted': 'Aceptada',
  'counterProposal.statusRejected': 'Rechazada',
  'counterProposal.colSupport': 'Soporte',
  'counterProposal.colOriginal': 'Original',
  'counterProposal.colProposed': 'Propuesto por el cliente',
  'counterProposal.colMargin': 'Margen',
  'counterProposal.lineDeleted': 'Eliminada por el cliente',
  'counterProposal.marginBelowFloor': 'Por debajo del suelo del 50 %',
  'counterProposal.mediaBuyNoMargin': 'Sin margen aplicable (media buy)',
  'counterProposal.forceMargin': 'Forzar por debajo del suelo',
  'counterProposal.forceMarginReasonLabel': 'Motivo (obligatorio)',
  'counterProposal.forceMarginConfirm': 'Confirmar',
  'counterProposal.forceMarginCancel': 'Cancelar',
  'counterProposal.forceMarginClear': 'Deshacer forzado',
  'counterProposal.campaignPeriod': 'Periodo propuesto',
  'counterProposal.fiscalData': 'Datos fiscales del cliente',
  'counterProposal.acceptButton': 'Aceptar contrapropuesta',
  'counterProposal.accepting': 'Aceptando…',
  'counterProposal.acceptSuccess': 'Contrapropuesta aceptada. Nuevo presupuesto: {number}.',
  'counterProposal.rejectButton': 'Rechazar contrapropuesta',
  'counterProposal.rejecting': 'Rechazando…',
  'counterProposal.rejectSuccess': 'Contrapropuesta rechazada. Email enviado al cliente.',
  'counterProposal.rejectReasonLabel': 'Motivo del rechazo (obligatorio, distinto del motivo del cliente)',
  'counterProposal.rejectReasonRequired': 'El motivo de rechazo es obligatorio.',
  'counterProposal.permissionDenied':
    'Solo el creador de este presupuesto o un administrador pueden decidir sobre esta contrapropuesta.',
  'counterProposal.previewEmailButton': 'Vista previa del email de rechazo',
  'counterProposal.previewEmailNotice':
    'No se ha enviado nada todavía: así se vería el email de rechazo con el motivo tecleado.',
} as const;

export type I18nKey = keyof typeof es;
type Dict = Record<I18nKey, string>;

const fr: Dict = {
  'app.title': 'Weekendesk Advertising',
  'header.signOut': 'Quitter',

  'login.subtitle': 'Accès réservé à l’équipe. Indique ton email et ton mot de passe Weekendesk.',
  'login.email': 'Email',
  'login.password': 'Mot de passe',
  'login.submit': 'Se connecter',
  'login.submitting': 'Connexion…',
  'login.noAccount': "Pas de compte ? Demande à Vincent de t'en créer un.",
  'login.adminLink': "Gérer les utilisateurs de l'équipe",

  'nav.newProposal': 'Nouveau devis',
  'nav.accountsList': 'Comptes',
  'nav.admin': 'Utilisateurs',
  'nav.dashboard': 'Tableau de bord',
  'nav.targets': 'Objectifs',

  'targets.title': 'Objectifs par advertising manager',
  'targets.fiscalYear': 'Année fiscale {year}',
  'targets.am': 'Advertising manager',
  'targets.q1': 'Q1 (mai-juil)',
  'targets.q2': 'Q2 (août-oct)',
  'targets.q3': 'Q3 (nov-jan)',
  'targets.q4': 'Q4 (fév-avr)',
  'targets.save': 'Enregistrer',
  'targets.saving': 'Enregistrement…',
  'targets.saved': 'Enregistré',
  'targets.note': "Objectif mesuré sur l'importe net des médias (les fees de gestion), jamais sur le total facturé — le budget médias qui transite par Weekendesk sans marge ne compte pas dans l'objectif (CLAUDE.md §4.4).",

  'dashboard.title': 'Tableau de bord',
  'dashboard.objective': 'Objectif de la période',
  'dashboard.wholeYear': 'Année complète',
  'dashboard.allAms': 'Tous les AM',
  'dashboard.kpiBilled': 'Facturé (net des médias)',
  'dashboard.kpiTarget': 'Objectif',
  'dashboard.kpiProgress': 'Progression',
  'dashboard.kpiAvgMargin': 'Marge moyenne',
  'dashboard.optionsWithoutMarginNote': '{count} acceptation(s) par contre-proposition sans marge calculable, exclue(s)',
  'dashboard.kpiPendingCounter': 'Contre-propositions en attente',
  'dashboard.kpiExpiringSoon': 'Expire bientôt',
  'dashboard.byMarket': 'Par marché',
  'dashboard.byAm': 'Par advertising manager',
  'dashboard.breakdownToggle': 'Voir la répartition par marché et AM',
  'dashboard.filterMarket': 'Marché',
  'dashboard.filterSupport': 'Support',
  'dashboard.filterAccount': 'Client',
  'dashboard.filterAccountPlaceholder': 'Rechercher par raison sociale…',
  'dashboard.filterProposalNumber': 'N° de devis',
  'dashboard.filterProposalNumberPlaceholder': 'Ex. 2026-014',
  'dashboard.filterDateFrom': 'Depuis',
  'dashboard.filterDateTo': "Jusqu'à",
  'dashboard.filterAmountMin': 'Montant min. (€)',
  'dashboard.filterAmountMax': 'Montant max. (€)',
  'dashboard.togglePendingCounter': 'Contre-proposition en attente uniquement',
  'dashboard.toggleExpiringSoon': 'Expire bientôt uniquement',
  'dashboard.all': 'Tous',
  'dashboard.resultsCount': '{shown} devis affichés sur {total}',
  'dashboard.colAmount': 'Montant',
  'dashboard.colMarkets': 'Marchés',

  'admin.title': "Utilisateurs de l'équipe",
  'admin.fullName': 'Nom complet',
  'admin.email': 'Email',
  'admin.password': 'Mot de passe initial',
  'admin.generatePassword': 'Générer',
  'admin.passwordNote': "À usage unique : la personne devra le changer dès sa première connexion.",
  'admin.inviteLanguage': "Langue d'invitation",
  'admin.note': 'Note (optionnelle)',
  'admin.create': "Créer l'accès",
  'admin.creating': 'Création…',
  'admin.existingTitle': 'Liste blanche actuelle',
  'admin.colEmail': 'Email',
  'admin.colName': 'Nom',
  'admin.colStatus': 'Statut',
  'admin.statusActive': 'Connecté au moins une fois',
  'admin.statusPending': "Pas encore connecté",
  'admin.remove': "Retirer l'accès",
  'admin.createdPasswordNotice':
    "Mot de passe initial créé. Partage-le par un canal sécurisé (pas par email) : il ne pourra plus être affiché.",
  'admin.onlyAllowedEmailNotice':
    "Cet email était déjà dans la liste blanche mais sans utilisateur Supabase Auth : l'accès vient d'être créé.",

  'changePassword.title': 'Définis ton nouveau mot de passe',
  'changePassword.subtitle':
    "Par sécurité, tu dois changer le mot de passe initial qu'on t'a donné avant de continuer.",
  'changePassword.newPassword': 'Nouveau mot de passe',
  'changePassword.confirmPassword': 'Répète le mot de passe',
  'changePassword.submit': 'Enregistrer et continuer',
  'changePassword.submitting': 'Enregistrement…',
  'changePassword.mismatchError': 'Les mots de passe ne correspondent pas.',

  'proposalBuilder.title': 'Nouveau devis',
  'proposalBuilder.accountAndContact': 'Compte et contact',
  'proposalBuilder.account': 'Compte',
  'proposalBuilder.newAccount': '+ Nouveau compte',
  'proposalBuilder.legalName': 'Raison sociale',
  'proposalBuilder.country': 'Pays',
  'proposalBuilder.contact': 'Contact',
  'proposalBuilder.newContact': '+ Nouveau contact',
  'proposalBuilder.contactFullName': 'Nom et prénom',
  'proposalBuilder.contactEmail': 'Email',
  'proposalBuilder.shipment': 'Envoi',
  'proposalBuilder.clientLanguage': 'Langue du client',
  'proposalBuilder.clientLanguageHelp':
    'Détermine la langue de la page publique et de l’email reçu par le client.',
  'proposalBuilder.brief': 'Brief de campagne',
  'proposalBuilder.briefPlaceholder': 'Ce que recherche le client, saison, destination…',
  'proposalBuilder.option': 'Option',
  'proposalBuilder.remove': 'Retirer',
  'proposalBuilder.optionName': "Nom de l'option (ex. Essentiel, Ample, Premium)",
  'proposalBuilder.optionPitch': "Phrase d'option : logique stratégique en 1-2 lignes",
  'proposalBuilder.markets': "Marchés de l'option",
  'proposalBuilder.marketsHelp':
    "Choisis une fois pour toute l'option : tous les supports se vendent automatiquement sur chacun d'eux.",
  'market.FR': 'France',
  'market.ES': 'Espagne',
  'market.IT': 'Italie',
  'market.BE_FR': 'Belgique (FR)',
  'market.BE_NL': 'Belgique (NL)',
  'market.NL': 'Pays-Bas',
  'proposalBuilder.scheduleMode': 'Période de campagne',
  'proposalBuilder.scheduleDates': 'Dates précises',
  'proposalBuilder.scheduleDurationOnly': 'Durée seule (sans dates)',
  'proposalBuilder.campaignStart': 'Début de campagne',
  'proposalBuilder.campaignEnd': 'Fin de campagne',
  'proposalBuilder.durationCount': 'Durée',
  'proposalBuilder.durationUnitWeek': 'semaines',
  'proposalBuilder.durationUnitMonth': 'mois',
  'proposalBuilder.durationOnlyWarning':
    "Sans date de début précise, le délai minimum de chaque support ne peut pas être vérifié.",
  'proposalBuilder.support': 'Support',
  'proposalBuilder.quantity': 'Qté',
  'proposalBuilder.media': 'Médias',
  'proposalBuilder.mediaBudgetLabel': 'Budget médias (€)',
  'proposalBuilder.mediaBudgetPlaceholder': '€ médias',
  'proposalBuilder.mediaBudgetRequired': 'Obligatoire',
  'proposalBuilder.mediaMonthsAutoLabel': 'Mois (selon la durée)',
  'proposalBuilder.mediaMonthsAutoHint':
    "Calculé automatiquement à partir de la durée de l'option — ce n'est pas un champ modifiable.",
  'proposalBuilder.forceMediaFee': 'Forcer le fee de gestion manuellement',
  'proposalBuilder.manualFeeLabel': 'Fee de gestion (€)',
  'proposalBuilder.manualFeeReasonLabel': 'Motif (obligatoire)',
  'proposalBuilder.influencerAmountLabel': "Montant pour l'influenceur (€)",
  'proposalBuilder.mediaSplitRequired': "La répartition n'est jamais automatique : confirmez-la manuellement.",
  'proposalBuilder.mediaFeeLabel': 'Fee',
  'proposalBuilder.mediaRealSpendLabel': 'Réel au média',
  'proposalBuilder.mediaFeeExceedsBudget': 'le budget ne couvre pas le minimum de gestion',
  'proposalBuilder.notSellableIn': 'Non commercialisable en',
  'proposalBuilder.availabilityNotice': "Confirmer la disponibilité avec Marketing avant de contractualiser.",
  'proposalBuilder.addLine': '+ Ajouter une ligne',
  'proposalBuilder.manualDiscounts': 'Remises manuelles',
  'proposalBuilder.discountReason': 'Motif (obligatoire)',
  'proposalBuilder.addDiscount': '+ Ajouter une remise',
  'proposalBuilder.disableVolumeDiscount': 'Désactiver la remise automatique par volume',
  'proposalBuilder.disableVolumeDiscountHelp':
    "Le tarif brut est facturé sans aucune remise par palier, même au-delà du seuil. Les remises manuelles, s'il y en a, continuent de s'appliquer à part. Enregistré avec auteur et date.",
  'proposalBuilder.addOption': '+ Ajouter une option',
  'proposalBuilder.editTitle': 'Modifier le devis {number}',
  'proposalBuilder.editUnavailable':
    "Le devis que tu voulais modifier n'est plus disponible (il n'existe plus, ou il a déjà été envoyé avec succès). Tu peux en créer un nouveau ici.",
  'proposalBuilder.draftReplacedNotice': 'Le brouillon précédent a été remplacé par cet envoi.',
  'proposalBuilder.preSendChecks': "Contrôles avant l'envoi",
  'proposalBuilder.internalCost': 'Coût interne',
  'proposalBuilder.grossFee': 'Tarif brut (net de médias)',
  'proposalBuilder.netRevenue': 'Montant net de médias',
  'proposalBuilder.mediaBudget': 'Budget médias',
  'proposalBuilder.billedTotal': 'Montant facturé',
  'proposalBuilder.margin': 'Marge',
  'proposalBuilder.save': 'Enregistrer',
  'proposalBuilder.saving': 'Enregistrement…',
  'proposalBuilder.send': 'Envoyer au client',
  'proposalBuilder.sending': 'Envoi…',
  'proposalBuilder.sentTitle': 'Envoi effectué',
  'proposalBuilder.sentBody': "L'envoi est figé et l'email est déjà parti à {email}, en copie à toi et à contracting@weekendesk.fr. Aucune modification ultérieure ne le change.",
  'proposalBuilder.viewPublic': 'Voir la page publique',
  'proposalBuilder.applyDuration': 'Utiliser la durée',
  'proposalBuilder.autoQuantityHint': 'Automatique selon la durée',
  'proposalBuilder.quantityHelpOn': 'Présent en continu pendant toute la période, pas un nombre de fois.',
  'proposalBuilder.quantityHelpCrm': "Nombre d'envois distincts pendant la période (ex. 2 = deux newsletters).",
  'proposalBuilder.quantityHelpSoc': 'Nombre de publications/stories pendant la période.',
  'proposalBuilder.viewProposal': 'Voir le devis envoyé',
  'proposalBuilder.createAnother': 'Créer un autre devis',
  'proposalBuilder.previewEmailModalTitle': "Aperçu de l'email",
  'proposalBuilder.previewEmailSubject': 'Objet',
  'proposalBuilder.previewEmailTabHtml': 'HTML',
  'proposalBuilder.previewEmailTabText': 'Texte brut',
  'proposalBuilder.previewEmailClose': 'Fermer',
  'proposalBuilder.previewNeedsData':
    "Renseigne au moins la raison sociale et le nom du contact pour voir l'aperçu.",
  'proposalBuilder.previewPdf': 'Aperçu du devis',
  'proposalBuilder.previewPdfLoading': 'Génération…',
  'proposalBuilder.previewPdfError': "Impossible de générer l'aperçu du PDF.",

  'checklist.allPass': "Tous les contrôles avant l'envoi passent.",
  'checklist.blocks': "Bloque l'envoi",
  'checklist.warning': 'Avertissement',
  'checklist.marginBelowFloor': 'Option {option} : marge de {rate} %, en dessous des {min} % exigés.',
  'checklist.calculationError':
    "Option {option} : impossible de calculer la marge — une donnée invalide dans une de ses lignes (voir l'avis sur l'option elle-même). Corrigez-la pour pouvoir évaluer cette option.",
  'checklist.campaignDatesInvalid':
    'Option {option} : la date de fin de campagne ne peut pas être antérieure à la date de début.',
  'checklist.leadTimeInsufficient':
    "{support} en {market} : il reste {available} jours ouvrés avant le début (hors jours fériés de {market}) et le support en exige {required}.",
  'checklist.leadTimeForced': '{support} en {market} : délai insuffisant, forcé — motif : {reason}',
  'checklist.supportNotSellable': "{support} n'est pas commercialisable en {market}.",
  'checklist.mediaBudgetMissing':
    '{support} : budget médias manquant (€). Obligatoire pour calculer le fee de gestion.',
  'checklist.mediaFeeExceedsBudget':
    '{support} : le budget médias du client ne couvre pas le minimum de gestion (il manque {amount} €). Forcez la répartition manuellement ou augmentez le budget.',
  'checklist.mediaSplitRequired':
    "{support} : la répartition entre le montant réel pour le média et le fee de gestion n'est jamais automatique. Confirmez-la manuellement avant l'envoi.",
  'checklist.emptyBrief':
    "Le brief de campagne est vide. Il est réutilisé dans l'email puis, plus tard, dans le PDF.",
  'checklist.forceLeadTime': 'Forcer le délai',
  'checklist.forceLeadTimeReasonLabel': 'Motif (obligatoire)',
  'checklist.forceLeadTimeConfirm': 'Confirmer',
  'checklist.forceLeadTimeCancel': 'Annuler',

  'pricingError.quantityNotPositive': '{support} : la quantité doit être supérieure à zéro.',
  'pricingError.mediaBudgetMissing': '{support} : le budget média est manquant.',
  'pricingError.mediaBudgetInvalid': '{support} : le budget média doit être un nombre valide.',
  'pricingError.mediaMonthsInvalid': '{support} : les mois du fee minimum doivent être un nombre valide.',
  'pricingError.manualFeeInvalid': "{support} : le montant pour l'influenceur doit être un nombre valide.",
  'pricingError.manualFeeReasonRequired': '{support} : le motif de la répartition forcée est manquant.',
  'pricingError.notMediaBuySupport': "{support} : ce support n'accepte pas de répartition média.",
  'pricingError.unknownSupport': '{support} : support inconnu.',
  'pricingError.duplicateSupportInOption': '{support} : ce support est déjà dans l\'option.',
  'pricingError.noMarketSelected': 'Choisissez au moins un marché pour cette option.',
  'pricingError.noCoefficientForMarket': 'Le coefficient de prix pour {market} est manquant.',
  'pricingError.manualDiscountReasonRequired': 'Le motif de la remise manuelle est manquant.',
  'pricingError.manualDiscountOutOfRange': 'La remise manuelle ({rate} %) est hors de la plage autorisée.',
  'pricingError.generic': 'Impossible de calculer cette option : vérifiez les données de ses lignes.',

  'discountBanner.nominal': 'Remise nominale',
  'discountBanner.effective': 'Remise effective',
  'discountBanner.none': 'Aucune remise appliquée.',
  'discountBanner.floorAbsorbs': 'Le plancher de marge absorbe {amount}',

  'status.DRAFT': 'Brouillon',
  'status.SENT': 'Envoyé',
  'status.VIEWED': 'Vu',
  'status.ACCEPTED': 'Accepté',
  'status.REJECTED': 'Refusé',
  'status.EXPIRED': 'Expiré',
  'status.COUNTERED': 'Contre-proposition reçue',

  'proposalsList.title': 'Devis',
  'proposalsList.filterStatus': 'Statut',
  'proposalsList.filterStatusAll': 'Tous',
  'proposalsList.filterOwner': 'Créateur',
  'proposalsList.filterOwnerAll': 'Tous',
  'proposalsList.colNumber': 'Numéro',
  'proposalsList.colAccount': 'Compte',
  'proposalsList.colContact': 'Contact',
  'proposalsList.colStatus': 'Statut',
  'proposalsList.colUpdated': 'Dernière modification',
  'proposalsList.colOwner': 'Créateur',
  'proposalsList.empty': 'Aucun devis avec ces filtres.',

  'proposalDetail.title': 'Devis',
  'proposalDetail.back': '← Retour au tableau de bord',
  'proposalDetail.draftNotice':
    "Ce devis a été calculé et enregistré, mais l'email n'est jamais parti. Le client ne l'a pas vu.",
  'proposalDetail.sendButton': 'Envoyer',
  'proposalDetail.sending': 'Envoi…',
  'proposalDetail.retrySuccess': 'Email envoyé. Le devis est maintenant marqué comme envoyé.',
  'proposalDetail.duplicateButton': 'Dupliquer',
  'proposalDetail.editButton': 'Modifier',
  'proposalDetail.duplicating': 'Duplication…',
  'proposalDetail.publicLink': 'Lien public',
  'proposalDetail.sentAt': 'Envoyé le',
  'proposalDetail.decidedAt': 'Décidé le',
  'proposalDetail.option': 'Option',
  'proposalDetail.lineMarket': 'Marché',
  'proposalDetail.notFound': 'Devis introuvable.',
  'proposalDetail.leadTimeForced': 'Délai forcé',
  'proposalDetail.downloadPdf': 'Télécharger le PDF',
  'proposalDetail.leadTimeForcedReason': 'Motif : {reason}',

  'accountsList.title': 'Comptes',
  'accountsList.colLegalName': 'Raison sociale',
  'accountsList.colCountry': 'Pays',
  'accountsList.colContacts': 'Contacts',
  'accountsList.colProposals': 'Devis',
  'accountsList.empty': 'Aucun compte pour le moment.',

  'accountDetail.title': 'Compte',
  'accountDetail.back': '← Retour aux comptes',
  'accountDetail.contacts': 'Contacts',
  'accountDetail.proposals': 'Historique des devis',
  'accountDetail.noProposals': "Ce compte n'a pas encore de devis.",

  'counterProposal.title': 'Contre-proposition du client',
  'counterProposal.submittedAt': 'Reçue le',
  'counterProposal.statusPending': 'En attente de révision',
  'counterProposal.statusAccepted': 'Acceptée',
  'counterProposal.statusRejected': 'Refusée',
  'counterProposal.colSupport': 'Support',
  'counterProposal.colOriginal': 'Original',
  'counterProposal.colProposed': 'Proposé par le client',
  'counterProposal.colMargin': 'Marge',
  'counterProposal.lineDeleted': 'Supprimée par le client',
  'counterProposal.marginBelowFloor': 'Sous le plancher de 50 %',
  'counterProposal.mediaBuyNoMargin': 'Marge non applicable (média payant)',
  'counterProposal.forceMargin': 'Forcer sous le plancher',
  'counterProposal.forceMarginReasonLabel': 'Motif (obligatoire)',
  'counterProposal.forceMarginConfirm': 'Confirmer',
  'counterProposal.forceMarginCancel': 'Annuler',
  'counterProposal.forceMarginClear': 'Annuler le forçage',
  'counterProposal.campaignPeriod': 'Période proposée',
  'counterProposal.fiscalData': 'Données fiscales du client',
  'counterProposal.acceptButton': 'Accepter la contre-proposition',
  'counterProposal.accepting': 'Acceptation…',
  'counterProposal.acceptSuccess': 'Contre-proposition acceptée. Nouveau devis : {number}.',
  'counterProposal.rejectButton': 'Refuser la contre-proposition',
  'counterProposal.rejecting': 'Refus…',
  'counterProposal.rejectSuccess': 'Contre-proposition refusée. Email envoyé au client.',
  'counterProposal.rejectReasonLabel': 'Motif du refus (obligatoire, distinct du motif du client)',
  'counterProposal.rejectReasonRequired': 'Le motif de refus est obligatoire.',
  'counterProposal.permissionDenied':
    'Seul le créateur de ce devis ou un administrateur peut décider de cette contre-proposition.',
  'counterProposal.previewEmailButton': "Aperçu de l'email de refus",
  'counterProposal.previewEmailNotice':
    "Rien n'a encore été envoyé : voici à quoi ressemblerait l'email de refus avec le motif saisi.",
};

const en: Dict = {
  'app.title': 'Weekendesk Advertising',
  'header.signOut': 'Sign out',

  'login.subtitle': 'Team access only. Enter your Weekendesk email and password.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.noAccount': "Don't have an account? Ask Vincent to create one for you.",
  'login.adminLink': 'Manage team users',

  'nav.newProposal': 'New proposal',
  'nav.accountsList': 'Accounts',
  'nav.admin': 'Users',
  'nav.dashboard': 'Dashboard',
  'nav.targets': 'Targets',

  'targets.title': 'Targets by advertising manager',
  'targets.fiscalYear': 'Fiscal year {year}',
  'targets.am': 'Advertising manager',
  'targets.q1': 'Q1 (May-Jul)',
  'targets.q2': 'Q2 (Aug-Oct)',
  'targets.q3': 'Q3 (Nov-Jan)',
  'targets.q4': 'Q4 (Feb-Apr)',
  'targets.save': 'Save',
  'targets.saving': 'Saving…',
  'targets.saved': 'Saved',
  'targets.note': 'The target is measured on net-of-media revenue (management fees), never on the total billed amount — the media budget that passes through Weekendesk without margin does not count toward the target (CLAUDE.md §4.4).',

  'dashboard.title': 'Dashboard',
  'dashboard.objective': 'Period target',
  'dashboard.wholeYear': 'Whole year',
  'dashboard.allAms': 'All AMs',
  'dashboard.kpiBilled': 'Billed (net of media)',
  'dashboard.kpiTarget': 'Target',
  'dashboard.kpiProgress': 'Progress',
  'dashboard.kpiAvgMargin': 'Average margin',
  'dashboard.optionsWithoutMarginNote': '{count} counter-offer acceptance(s) with no calculable margin, excluded',
  'dashboard.kpiPendingCounter': 'Pending counter-offers',
  'dashboard.kpiExpiringSoon': 'Expiring soon',
  'dashboard.byMarket': 'By market',
  'dashboard.byAm': 'By advertising manager',
  'dashboard.breakdownToggle': 'View breakdown by market and AM',
  'dashboard.filterMarket': 'Market',
  'dashboard.filterSupport': 'Placement',
  'dashboard.filterAccount': 'Client',
  'dashboard.filterAccountPlaceholder': 'Search by legal name…',
  'dashboard.filterProposalNumber': 'Proposal number',
  'dashboard.filterProposalNumberPlaceholder': 'E.g. 2026-014',
  'dashboard.filterDateFrom': 'From',
  'dashboard.filterDateTo': 'To',
  'dashboard.filterAmountMin': 'Min amount (€)',
  'dashboard.filterAmountMax': 'Max amount (€)',
  'dashboard.togglePendingCounter': 'Pending counter-offer only',
  'dashboard.toggleExpiringSoon': 'Expiring soon only',
  'dashboard.all': 'All',
  'dashboard.resultsCount': 'Showing {shown} of {total} proposals',
  'dashboard.colAmount': 'Amount',
  'dashboard.colMarkets': 'Markets',

  'admin.title': 'Team users',
  'admin.fullName': 'Full name',
  'admin.email': 'Email',
  'admin.password': 'Initial password',
  'admin.generatePassword': 'Generate',
  'admin.passwordNote': 'One-time use: the person will have to change it the first time they sign in.',
  'admin.inviteLanguage': 'Invitation language',
  'admin.note': 'Note (optional)',
  'admin.create': 'Create access',
  'admin.creating': 'Creating…',
  'admin.existingTitle': 'Current whitelist',
  'admin.colEmail': 'Email',
  'admin.colName': 'Name',
  'admin.colStatus': 'Status',
  'admin.statusActive': 'Has signed in',
  'admin.statusPending': "Hasn't signed in yet",
  'admin.remove': 'Remove access',
  'admin.createdPasswordNotice':
    "Initial password created. Share it over a secure channel (not email) — it can't be shown again.",
  'admin.onlyAllowedEmailNotice':
    'This email was already whitelisted but had no Supabase Auth user: the access was just created.',

  'changePassword.title': 'Set your new password',
  'changePassword.subtitle':
    'For security, you need to change the initial password you were given before continuing.',
  'changePassword.newPassword': 'New password',
  'changePassword.confirmPassword': 'Confirm password',
  'changePassword.submit': 'Save and continue',
  'changePassword.submitting': 'Saving…',
  'changePassword.mismatchError': 'Passwords do not match.',

  'proposalBuilder.title': 'New proposal',
  'proposalBuilder.accountAndContact': 'Account and contact',
  'proposalBuilder.account': 'Account',
  'proposalBuilder.newAccount': '+ New account',
  'proposalBuilder.legalName': 'Legal name',
  'proposalBuilder.country': 'Country',
  'proposalBuilder.contact': 'Contact',
  'proposalBuilder.newContact': '+ New contact',
  'proposalBuilder.contactFullName': 'Full name',
  'proposalBuilder.contactEmail': 'Email',
  'proposalBuilder.shipment': 'Proposal',
  'proposalBuilder.clientLanguage': 'Client language',
  'proposalBuilder.clientLanguageHelp':
    'Determines the language of the public page and the email the client receives.',
  'proposalBuilder.brief': 'Campaign brief',
  'proposalBuilder.briefPlaceholder': 'What the client is looking for, season, destination…',
  'proposalBuilder.option': 'Option',
  'proposalBuilder.remove': 'Remove',
  'proposalBuilder.optionName': 'Option name (e.g. Entry, Extended, Premium)',
  'proposalBuilder.optionPitch': 'Option pitch: strategic logic in 1-2 lines',
  'proposalBuilder.markets': 'Option markets',
  'proposalBuilder.marketsHelp':
    'Chosen once for the whole option: every support sells automatically in all of them.',
  'market.FR': 'France',
  'market.ES': 'Spain',
  'market.IT': 'Italy',
  'market.BE_FR': 'Belgium (FR)',
  'market.BE_NL': 'Belgium (NL)',
  'market.NL': 'Netherlands',
  'proposalBuilder.scheduleMode': 'Campaign period',
  'proposalBuilder.scheduleDates': 'Specific dates',
  'proposalBuilder.scheduleDurationOnly': 'Duration only (no dates)',
  'proposalBuilder.campaignStart': 'Campaign start',
  'proposalBuilder.campaignEnd': 'Campaign end',
  'proposalBuilder.durationCount': 'Duration',
  'proposalBuilder.durationUnitWeek': 'weeks',
  'proposalBuilder.durationUnitMonth': 'months',
  'proposalBuilder.durationOnlyWarning':
    "Without a concrete start date, each support's minimum lead time cannot be checked.",
  'proposalBuilder.support': 'Support',
  'proposalBuilder.quantity': 'Qty',
  'proposalBuilder.media': 'Media',
  'proposalBuilder.mediaBudgetLabel': 'Media budget (€)',
  'proposalBuilder.mediaBudgetPlaceholder': '€ media',
  'proposalBuilder.mediaBudgetRequired': 'Required',
  'proposalBuilder.mediaMonthsAutoLabel': 'Months (from duration)',
  'proposalBuilder.mediaMonthsAutoHint':
    "Calculated automatically from the option's duration — not an editable field.",
  'proposalBuilder.forceMediaFee': 'Force the management fee manually',
  'proposalBuilder.manualFeeLabel': 'Management fee (€)',
  'proposalBuilder.manualFeeReasonLabel': 'Reason (required)',
  'proposalBuilder.influencerAmountLabel': 'Amount for the influencer (€)',
  'proposalBuilder.mediaSplitRequired': 'The split is never automatic: confirm it manually.',
  'proposalBuilder.mediaFeeLabel': 'Fee',
  'proposalBuilder.mediaRealSpendLabel': 'Real spend to medium',
  'proposalBuilder.mediaFeeExceedsBudget': "budget doesn't cover the management minimum",
  'proposalBuilder.notSellableIn': 'Not sellable in',
  'proposalBuilder.availabilityNotice': 'Confirm availability with Marketing before booking.',
  'proposalBuilder.addLine': '+ Add line',
  'proposalBuilder.manualDiscounts': 'Manual discounts',
  'proposalBuilder.discountReason': 'Reason (required)',
  'proposalBuilder.addDiscount': '+ Add discount',
  'proposalBuilder.disableVolumeDiscount': 'Disable the automatic volume discount',
  'proposalBuilder.disableVolumeDiscountHelp':
    'The gross tariff is billed with no tier discount at all, even past the threshold. Manual discounts, if any, still apply separately. Recorded with author and date.',
  'proposalBuilder.addOption': '+ Add option',
  'proposalBuilder.editTitle': 'Edit proposal {number}',
  'proposalBuilder.editUnavailable':
    "The proposal you wanted to edit is no longer available (it doesn't exist, or it was already sent successfully). You can create a new one here.",
  'proposalBuilder.draftReplacedNotice': 'The previous draft has been replaced by this send.',
  'proposalBuilder.preSendChecks': 'Pre-send checks',
  'proposalBuilder.internalCost': 'Internal cost',
  'proposalBuilder.grossFee': 'Gross fee (net of media)',
  'proposalBuilder.netRevenue': 'Net of media amount',
  'proposalBuilder.mediaBudget': 'Media budget',
  'proposalBuilder.billedTotal': 'Billed amount',
  'proposalBuilder.margin': 'Margin',
  'proposalBuilder.save': 'Save',
  'proposalBuilder.saving': 'Saving…',
  'proposalBuilder.send': 'Send to client',
  'proposalBuilder.sending': 'Sending…',
  'proposalBuilder.sentTitle': 'Proposal sent',
  'proposalBuilder.sentBody': "The proposal is frozen and the email has already gone out to {email}, cc'd to you and to contracting@weekendesk.fr. No later change alters it.",
  'proposalBuilder.viewPublic': 'View public page',
  'proposalBuilder.applyDuration': 'Use duration',
  'proposalBuilder.autoQuantityHint': 'Automatic from duration',
  'proposalBuilder.quantityHelpOn': 'Present continuously throughout the period, not a number of times.',
  'proposalBuilder.quantityHelpCrm': 'Number of distinct sends during the period (e.g. 2 = two newsletters).',
  'proposalBuilder.quantityHelpSoc': 'Number of posts/stories during the period.',
  'proposalBuilder.viewProposal': 'View sent proposal',
  'proposalBuilder.createAnother': 'Create another proposal',
  'proposalBuilder.previewEmailModalTitle': 'Email preview',
  'proposalBuilder.previewEmailSubject': 'Subject',
  'proposalBuilder.previewEmailTabHtml': 'HTML',
  'proposalBuilder.previewEmailTabText': 'Plain text',
  'proposalBuilder.previewEmailClose': 'Close',
  'proposalBuilder.previewNeedsData':
    'Fill in at least the legal name and the contact name to see the preview.',
  'proposalBuilder.previewPdf': 'Preview proposal',
  'proposalBuilder.previewPdfLoading': 'Generating…',
  'proposalBuilder.previewPdfError': 'The PDF preview could not be generated.',

  'checklist.allPass': 'All pre-send checks pass.',
  'checklist.blocks': 'Blocks sending',
  'checklist.warning': 'Warning',
  'checklist.marginBelowFloor': 'Option {option}: margin of {rate}%, below the required {min}%.',
  'checklist.calculationError':
    'Option {option}: the margin cannot be calculated — there is invalid data in one of its lines (see the notice on the option itself). Fix it to be able to evaluate this option.',
  'checklist.campaignDatesInvalid':
    'Option {option}: the campaign end date cannot be earlier than the start date.',
  'checklist.leadTimeInsufficient':
    '{support} in {market}: {available} business days left until the start (excluding {market} holidays) and the support requires {required}.',
  'checklist.leadTimeForced': '{support} in {market}: insufficient lead time, forced — reason: {reason}',
  'checklist.supportNotSellable': '{support} is not sellable in {market}.',
  'checklist.mediaBudgetMissing':
    '{support}: missing media budget (€). Required to calculate the management fee.',
  'checklist.mediaFeeExceedsBudget':
    "{support}: the client's media budget doesn't cover the management minimum (missing {amount} €). Force the split manually or raise the budget.",
  'checklist.mediaSplitRequired':
    '{support}: the split between the real amount for the medium and the management fee is never automatic. Confirm it manually before sending.',
  'checklist.emptyBrief':
    "The campaign brief is empty. It's reused in the email and, later, in the PDF.",
  'checklist.forceLeadTime': 'Force lead time',
  'checklist.forceLeadTimeReasonLabel': 'Reason (required)',
  'checklist.forceLeadTimeConfirm': 'Confirm',
  'checklist.forceLeadTimeCancel': 'Cancel',

  'pricingError.quantityNotPositive': '{support}: quantity must be greater than zero.',
  'pricingError.mediaBudgetMissing': '{support}: the media budget is missing.',
  'pricingError.mediaBudgetInvalid': '{support}: the media budget must be a valid number.',
  'pricingError.mediaMonthsInvalid': '{support}: the minimum-fee months must be a valid number.',
  'pricingError.manualFeeInvalid': '{support}: the amount for the influencer must be a valid number.',
  'pricingError.manualFeeReasonRequired': '{support}: the reason for the forced split is missing.',
  'pricingError.notMediaBuySupport': '{support}: this support does not accept a media split.',
  'pricingError.unknownSupport': '{support}: unknown support.',
  'pricingError.duplicateSupportInOption': '{support}: this support is already in the option.',
  'pricingError.noMarketSelected': 'Choose at least one market for this option.',
  'pricingError.noCoefficientForMarket': 'The price coefficient for {market} is missing.',
  'pricingError.manualDiscountReasonRequired': 'The reason for the manual discount is missing.',
  'pricingError.manualDiscountOutOfRange': 'The manual discount ({rate}%) is out of the allowed range.',
  'pricingError.generic': 'This option could not be calculated: check its line data.',

  'discountBanner.nominal': 'Nominal discount',
  'discountBanner.effective': 'Effective discount',
  'discountBanner.none': 'No discount applied.',
  'discountBanner.floorAbsorbs': 'The margin floor absorbs {amount}',

  'status.DRAFT': 'Draft',
  'status.SENT': 'Sent',
  'status.VIEWED': 'Viewed',
  'status.ACCEPTED': 'Accepted',
  'status.REJECTED': 'Rejected',
  'status.EXPIRED': 'Expired',
  'status.COUNTERED': 'Counter-offer received',

  'proposalsList.title': 'Proposals',
  'proposalsList.filterStatus': 'Status',
  'proposalsList.filterStatusAll': 'All',
  'proposalsList.filterOwner': 'Creator',
  'proposalsList.filterOwnerAll': 'All',
  'proposalsList.colNumber': 'Number',
  'proposalsList.colAccount': 'Account',
  'proposalsList.colContact': 'Contact',
  'proposalsList.colStatus': 'Status',
  'proposalsList.colUpdated': 'Last modified',
  'proposalsList.colOwner': 'Creator',
  'proposalsList.empty': 'No proposals match these filters.',

  'proposalDetail.title': 'Proposal',
  'proposalDetail.back': '← Back to dashboard',
  'proposalDetail.draftNotice':
    'This proposal was calculated and saved, but the email never went out. The client has not seen it.',
  'proposalDetail.sendButton': 'Send',
  'proposalDetail.sending': 'Sending…',
  'proposalDetail.retrySuccess': 'Email sent. The proposal is now marked as sent.',
  'proposalDetail.duplicateButton': 'Duplicate',
  'proposalDetail.editButton': 'Edit',
  'proposalDetail.duplicating': 'Duplicating…',
  'proposalDetail.publicLink': 'Public link',
  'proposalDetail.sentAt': 'Sent on',
  'proposalDetail.decidedAt': 'Decided on',
  'proposalDetail.option': 'Option',
  'proposalDetail.lineMarket': 'Market',
  'proposalDetail.leadTimeForced': 'Lead time forced',
  'proposalDetail.leadTimeForcedReason': 'Reason: {reason}',
  'proposalDetail.downloadPdf': 'Download PDF',
  'proposalDetail.notFound': 'Proposal not found.',

  'accountsList.title': 'Accounts',
  'accountsList.colLegalName': 'Legal name',
  'accountsList.colCountry': 'Country',
  'accountsList.colContacts': 'Contacts',
  'accountsList.colProposals': 'Proposals',
  'accountsList.empty': 'No accounts yet.',

  'accountDetail.title': 'Account',
  'accountDetail.back': '← Back to accounts',
  'accountDetail.contacts': 'Contacts',
  'accountDetail.proposals': 'Proposal history',
  'accountDetail.noProposals': 'This account has no proposals yet.',

  'counterProposal.title': "Client's counter-offer",
  'counterProposal.submittedAt': 'Received on',
  'counterProposal.statusPending': 'Pending review',
  'counterProposal.statusAccepted': 'Accepted',
  'counterProposal.statusRejected': 'Rejected',
  'counterProposal.colSupport': 'Support',
  'counterProposal.colOriginal': 'Original',
  'counterProposal.colProposed': "Proposed by the client",
  'counterProposal.colMargin': 'Margin',
  'counterProposal.lineDeleted': 'Removed by the client',
  'counterProposal.marginBelowFloor': 'Below the 50% floor',
  'counterProposal.mediaBuyNoMargin': 'No margin applicable (media buy)',
  'counterProposal.forceMargin': 'Force below the floor',
  'counterProposal.forceMarginReasonLabel': 'Reason (required)',
  'counterProposal.forceMarginConfirm': 'Confirm',
  'counterProposal.forceMarginCancel': 'Cancel',
  'counterProposal.forceMarginClear': 'Undo force',
  'counterProposal.campaignPeriod': 'Proposed period',
  'counterProposal.fiscalData': "Client's fiscal data",
  'counterProposal.acceptButton': 'Accept counter-offer',
  'counterProposal.accepting': 'Accepting…',
  'counterProposal.acceptSuccess': 'Counter-offer accepted. New proposal: {number}.',
  'counterProposal.rejectButton': 'Reject counter-offer',
  'counterProposal.rejecting': 'Rejecting…',
  'counterProposal.rejectSuccess': 'Counter-offer rejected. Email sent to the client.',
  'counterProposal.rejectReasonLabel': "Rejection reason (required, distinct from the client's reason)",
  'counterProposal.rejectReasonRequired': 'A rejection reason is required.',
  'counterProposal.permissionDenied':
    'Only this proposal\'s creator or an administrator can decide on this counter-offer.',
  'counterProposal.previewEmailButton': 'Preview rejection email',
  'counterProposal.previewEmailNotice': "Nothing has been sent yet: this is what the rejection email would look like with the reason typed so far.",
};

const DICTS: Record<InternalLanguage, Dict> = { ES: es, FR: fr, EN: en };

/** Solo para tests: los tres diccionarios completos (ronda 14, verificar market.*). */
export const DICTS_FOR_TESTING = DICTS;

function readStoredLanguage(): InternalLanguage {
  if (typeof window === 'undefined') return 'ES';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'ES' || stored === 'FR' || stored === 'EN') return stored;
  } catch {
    // localStorage puede no estar disponible (ventana privada, etc.): se
    // usa el valor por defecto sin romper el render.
  }
  return 'ES';
}

/**
 * ¿Ya eligió esta persona un idioma de interfaz EN ESTE NAVEGADOR? Distinto
 * de `readStoredLanguage()`, que siempre devuelve un valor usable (cae a
 * 'ES') — aquí hace falta distinguir "nunca eligió nada" de "eligió ES
 * explícitamente", para que `profiles.preferred_language` (CLAUDE.md, ronda
 * 17, bloque 3) solo actúe como semilla la primera vez, sin pisar nunca una
 * preferencia ya guardada.
 */
export function hasExplicitStoredLanguage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'ES' || stored === 'FR' || stored === 'EN';
  } catch {
    return false;
  }
}

interface I18nContextValue {
  readonly language: InternalLanguage;
  readonly setLanguage: (language: InternalLanguage) => void;
  readonly t: (key: I18nKey, vars?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Sustituye `{variable}` por su valor en `text`. Pura y exportada aparte de
 * `t()` (que necesita el `InternalI18nProvider` de React) para poder
 * testearla sin renderizar nada — igual que el resto del motor de este
 * proyecto separa cálculo puro de interfaz.
 *
 * `replaceAll`, no `replace`: una plantilla puede repetir la misma variable
 * más de una vez (p. ej. `checklist.leadTimeInsufficient`, ronda 11: "...en
 * {market}... festivos de {market}..."). Bug real encontrado con Playwright
 * contra un navegador real, no por ningún test unitario (CLAUDE.md §10.3
 * undecies): con `replace()`, de un solo uso, la segunda aparición de
 * `{market}` llegaba a pantalla sin traducir, literal.
 */
export function interpolate(text: string, vars?: Record<string, string>): string {
  if (!vars) return text;
  let result = text;
  for (const [name, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${name}}`, value);
  }
  return result;
}

export function InternalI18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<InternalLanguage>('ES');

  useEffect(() => {
    setLanguageState(readStoredLanguage());
  }, []);

  const setLanguage = useCallback((next: InternalLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Conveniencia de navegador: si no se puede guardar, la preferencia
      // simplemente no sobrevive a un refresco. No es un dato de negocio.
    }
  }, []);

  const t = useCallback<I18nContextValue['t']>(
    (key, vars) => interpolate(DICTS[language][key] ?? DICTS.ES[key] ?? key, vars),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n debe usarse dentro de <InternalI18nProvider>');
  }
  return ctx;
}
