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
  'nav.proposalsList': 'Presupuestos',
  'nav.accountsList': 'Cuentas',
  'nav.admin': 'Usuarios',

  'admin.title': 'Usuarios del equipo',
  'admin.subtitle':
    'Da de alta a alguien del equipo: se crea su acceso (email + contraseña) en Supabase Auth y se añade a la lista blanca en el mismo paso.',
  'admin.fullName': 'Nombre completo',
  'admin.email': 'Email',
  'admin.password': 'Contraseña inicial',
  'admin.generatePassword': 'Generar',
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
  'proposalBuilder.needsSecondOption': 'Añade una segunda opción para poder enviar (un envío necesita 2 o 3).',
  'proposalBuilder.preSendChecks': 'Controles previos al envío',
  'proposalBuilder.internalCost': 'Coste interno',
  'proposalBuilder.grossFee': 'Tarifa bruta (neta de medios)',
  'proposalBuilder.netRevenue': 'Importe neto de medios',
  'proposalBuilder.mediaBudget': 'Presupuesto de medios',
  'proposalBuilder.billedTotal': 'Importe facturado',
  'proposalBuilder.margin': 'Margen',
  'proposalBuilder.send': 'Enviar al cliente',
  'proposalBuilder.sending': 'Enviando…',
  'proposalBuilder.sentTitle': 'Envío enviado',
  'proposalBuilder.sentBody': 'El envío está congelado y el email ya ha salido a {email}, con copia a ti y a contracting@weekendesk.fr. Ningún cambio posterior lo altera.',
  'proposalBuilder.viewPublic': 'Ver pantalla pública',
  'proposalBuilder.applyDuration': 'Usar duración',
  'proposalBuilder.autoQuantityHint': 'Automático según duración',
  'proposalBuilder.viewProposal': 'Ver presupuesto enviado',
  'proposalBuilder.createAnother': 'Crear otro presupuesto',

  'checklist.allPass': 'Todos los controles previos al envío pasan.',
  'checklist.blocks': 'Bloquea el envío',
  'checklist.warning': 'Aviso',
  'checklist.marginBelowFloor': 'Opción {option}: margen del {rate} %, por debajo del {min} % exigido.',
  'checklist.campaignDatesInvalid':
    'Opción {option}: la fecha de fin de campaña no puede ser anterior a la de inicio.',
  'checklist.leadTimeInsufficient':
    '{support} en {market}: quedan {available} días laborables hasta el inicio (descontando festivos de {market}) y el soporte exige {required}.',
  'checklist.leadTimeForced': '{support} en {market}: antelación insuficiente, forzada — motivo: {reason}',
  'checklist.leadTimeNotVerifiable':
    'Opción {option}: cotizada solo por duración, sin fecha de inicio. No se puede comprobar la antelación de {support} en {market} (exige {required} días laborables).',
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
  'proposalDetail.back': '← Volver a presupuestos',
  'proposalDetail.draftNotice':
    'Este presupuesto se calculó y quedó guardado, pero el email nunca llegó a salir. El cliente no lo ha visto.',
  'proposalDetail.retryButton': 'Reintentar envío',
  'proposalDetail.retrying': 'Reintentando…',
  'proposalDetail.retrySuccess': 'Email enviado. El presupuesto ya está marcado como enviado.',
  'proposalDetail.duplicateButton': 'Duplicar',
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
  'nav.proposalsList': 'Devis',
  'nav.accountsList': 'Comptes',
  'nav.admin': 'Utilisateurs',

  'admin.title': "Utilisateurs de l'équipe",
  'admin.subtitle':
    "Ajoute quelqu'un à l'équipe : son accès (email + mot de passe) est créé dans Supabase Auth et ajouté à la liste blanche en une seule étape.",
  'admin.fullName': 'Nom complet',
  'admin.email': 'Email',
  'admin.password': 'Mot de passe initial',
  'admin.generatePassword': 'Générer',
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
  'proposalBuilder.needsSecondOption': "Ajoute une deuxième option pour pouvoir envoyer (un envoi a besoin de 2 ou 3 options).",
  'proposalBuilder.preSendChecks': "Contrôles avant l'envoi",
  'proposalBuilder.internalCost': 'Coût interne',
  'proposalBuilder.grossFee': 'Tarif brut (net de médias)',
  'proposalBuilder.netRevenue': 'Montant net de médias',
  'proposalBuilder.mediaBudget': 'Budget médias',
  'proposalBuilder.billedTotal': 'Montant facturé',
  'proposalBuilder.margin': 'Marge',
  'proposalBuilder.send': 'Envoyer au client',
  'proposalBuilder.sending': 'Envoi…',
  'proposalBuilder.sentTitle': 'Envoi effectué',
  'proposalBuilder.sentBody': "L'envoi est figé et l'email est déjà parti à {email}, en copie à toi et à contracting@weekendesk.fr. Aucune modification ultérieure ne le change.",
  'proposalBuilder.viewPublic': 'Voir la page publique',
  'proposalBuilder.applyDuration': 'Utiliser la durée',
  'proposalBuilder.autoQuantityHint': 'Automatique selon la durée',
  'proposalBuilder.viewProposal': 'Voir le devis envoyé',
  'proposalBuilder.createAnother': 'Créer un autre devis',

  'checklist.allPass': "Tous les contrôles avant l'envoi passent.",
  'checklist.blocks': "Bloque l'envoi",
  'checklist.warning': 'Avertissement',
  'checklist.marginBelowFloor': 'Option {option} : marge de {rate} %, en dessous des {min} % exigés.',
  'checklist.campaignDatesInvalid':
    'Option {option} : la date de fin de campagne ne peut pas être antérieure à la date de début.',
  'checklist.leadTimeInsufficient':
    "{support} en {market} : il reste {available} jours ouvrés avant le début (hors jours fériés de {market}) et le support en exige {required}.",
  'checklist.leadTimeForced': '{support} en {market} : délai insuffisant, forcé — motif : {reason}',
  'checklist.leadTimeNotVerifiable':
    "Option {option} : devis établi uniquement par durée, sans date de début. Impossible de vérifier le délai de {support} en {market} (exige {required} jours ouvrés).",
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
  'proposalDetail.back': '← Retour aux devis',
  'proposalDetail.draftNotice':
    "Ce devis a été calculé et enregistré, mais l'email n'est jamais parti. Le client ne l'a pas vu.",
  'proposalDetail.retryButton': "Réessayer l'envoi",
  'proposalDetail.retrying': 'Nouvel essai…',
  'proposalDetail.retrySuccess': 'Email envoyé. Le devis est maintenant marqué comme envoyé.',
  'proposalDetail.duplicateButton': 'Dupliquer',
  'proposalDetail.duplicating': 'Duplication…',
  'proposalDetail.publicLink': 'Lien public',
  'proposalDetail.sentAt': 'Envoyé le',
  'proposalDetail.decidedAt': 'Décidé le',
  'proposalDetail.option': 'Option',
  'proposalDetail.lineMarket': 'Marché',
  'proposalDetail.notFound': 'Devis introuvable.',
  'proposalDetail.leadTimeForced': 'Délai forcé',
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
  'nav.proposalsList': 'Proposals',
  'nav.accountsList': 'Accounts',
  'nav.admin': 'Users',

  'admin.title': 'Team users',
  'admin.subtitle':
    'Add someone to the team: their access (email + password) is created in Supabase Auth and added to the whitelist in one step.',
  'admin.fullName': 'Full name',
  'admin.email': 'Email',
  'admin.password': 'Initial password',
  'admin.generatePassword': 'Generate',
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
  'proposalBuilder.needsSecondOption': 'Add a second option before sending (a proposal needs 2 or 3).',
  'proposalBuilder.preSendChecks': 'Pre-send checks',
  'proposalBuilder.internalCost': 'Internal cost',
  'proposalBuilder.grossFee': 'Gross fee (net of media)',
  'proposalBuilder.netRevenue': 'Net of media amount',
  'proposalBuilder.mediaBudget': 'Media budget',
  'proposalBuilder.billedTotal': 'Billed amount',
  'proposalBuilder.margin': 'Margin',
  'proposalBuilder.send': 'Send to client',
  'proposalBuilder.sending': 'Sending…',
  'proposalBuilder.sentTitle': 'Proposal sent',
  'proposalBuilder.sentBody': "The proposal is frozen and the email has already gone out to {email}, cc'd to you and to contracting@weekendesk.fr. No later change alters it.",
  'proposalBuilder.viewPublic': 'View public page',
  'proposalBuilder.applyDuration': 'Use duration',
  'proposalBuilder.autoQuantityHint': 'Automatic from duration',
  'proposalBuilder.viewProposal': 'View sent proposal',
  'proposalBuilder.createAnother': 'Create another proposal',

  'checklist.allPass': 'All pre-send checks pass.',
  'checklist.blocks': 'Blocks sending',
  'checklist.warning': 'Warning',
  'checklist.marginBelowFloor': 'Option {option}: margin of {rate}%, below the required {min}%.',
  'checklist.campaignDatesInvalid':
    'Option {option}: the campaign end date cannot be earlier than the start date.',
  'checklist.leadTimeInsufficient':
    '{support} in {market}: {available} business days left until the start (excluding {market} holidays) and the support requires {required}.',
  'checklist.leadTimeForced': '{support} in {market}: insufficient lead time, forced — reason: {reason}',
  'checklist.leadTimeNotVerifiable':
    'Option {option}: quoted only by duration, with no start date. Cannot check the lead time of {support} in {market} (requires {required} business days).',
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
  'proposalDetail.back': '← Back to proposals',
  'proposalDetail.draftNotice':
    'This proposal was calculated and saved, but the email never went out. The client has not seen it.',
  'proposalDetail.retryButton': 'Retry send',
  'proposalDetail.retrying': 'Retrying…',
  'proposalDetail.retrySuccess': 'Email sent. The proposal is now marked as sent.',
  'proposalDetail.duplicateButton': 'Duplicate',
  'proposalDetail.duplicating': 'Duplicating…',
  'proposalDetail.publicLink': 'Public link',
  'proposalDetail.sentAt': 'Sent on',
  'proposalDetail.decidedAt': 'Decided on',
  'proposalDetail.option': 'Option',
  'proposalDetail.lineMarket': 'Market',
  'proposalDetail.leadTimeForced': 'Lead time forced',
  'proposalDetail.leadTimeForcedReason': 'Reason: {reason}',
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
};

const DICTS: Record<InternalLanguage, Dict> = { ES: es, FR: fr, EN: en };

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
