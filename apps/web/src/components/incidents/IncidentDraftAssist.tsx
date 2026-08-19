/**
 * IncidentDraftAssist.tsx — PROPOSITIONS INDÉPENDANTES TITRE / DESCRIPTION.
 *
 * PRINCIPE CLÉ demandé par l'utilisateur :
 *   - Click bouton ⟳ TITRE     → change SEULEMENT le champ TITRE
 *   - Click bouton ⟳ DESCRIPTION → change SEULEMENT le champ DESCRIPTION
 * Aucun changement croisé entre les deux régénérations.
 *
 * Expose :
 *   - useDraftProposal() : hook principal → 2 régénérations et 2 applies séparés
 *   - <TitleAssistButtons /> : icônes sparkles + ⟳ intégrées DANS le champ titre
 *   - <DescAssistButtons />  : icônes sparkles + ⟳ intégrées DANS le textarea desc
 *   - <IncidentDraftAssist /> : (rétro-compatibilité, affiche rien)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { IncidentTypeDef } from "@/lib/types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* =========================== TYPES =========================== */

export interface DescriptionProposalInput {
  type: string | null;
  titre: string;
  adresse: string;
  province: string;
  ville: string;
  pt: [number, number] | null;
  lang: "fr" | "ar" | "en";
  incidentTypes: IncidentTypeDef[];
}

interface DescPair { l1: string; l2: string; }

export type Proposal = { title: string; desc: string };

/* =========================== HELPERS =========================== */

function labelOf(
  input: Pick<DescriptionProposalInput, "type" | "lang" | "incidentTypes">,
): string {
  if (!input.type) return "Incident";
  const def = input.incidentTypes.find((d) => d.id === input.type);
  if (!def) return input.type;
  const labels = def.labels as Partial<Record<"fr" | "ar" | "en", string>>;
  return labels[input.lang] ?? labels.fr ?? labels.ar ?? labels.en ?? input.type;
}

function lieuOf(
  input: Pick<DescriptionProposalInput, "ville" | "province" | "adresse">,
): string {
  return [input.ville, input.province, input.adresse]
    .map((s) => s.trim())
    .filter(Boolean)[0] ?? "";
}

function inject(s: string, label: string, lieu: string): string {
  const lieuDet = lieu ? ` au niveau de ${lieu}` : "";
  const labelCamel = label.charAt(0).toUpperCase() + label.slice(1);
  return s
    .replaceAll("{lieu}", lieu ? ` — ${lieu}` : "")
    .replaceAll("{lieuDet}", lieuDet)
    .replaceAll("{labelCamel}", labelCamel)
    .replaceAll("{label}", label);
}

function buildDesc(p: DescPair, label: string, lieu: string): string {
  return `${inject(p.l1, label, lieu)}\n${inject(p.l2, label, lieu)}`;
}

function rngSeed(seed: number, N: number): number {
  if (N <= 0) return 0;
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((x - Math.floor(x)) * N);
}

/* ===================== CATALOGUE TEMPLATES RICHE ===================== */

const TITLE_POOL: Record<string, string[]> = {
  earthquake: ["Séisme ressenti{lieu}", "Phénomène sismique{lieu}", "Tremblement de terre{lieu}", "Activité sismique enregistrée{lieu}", "Réplique sismique{lieu}", "Événement tellurique{lieu}", "Secousse sismique{lieu}", "Alerte séisme{lieu}", "Secousse ressentie{lieu}", "Activité tellurique{lieu}"],
  wildfire: ["Départ de feu de forêt{lieu}", "Incendie en zone végétale{lieu}", "Feu de végétation{lieu}", "Foyer d'incendie{lieu}", "Feu de broussailles{lieu}", "Propagation d'incendie{lieu}", "Départ de feu{lieu}", "Feu de forêt{lieu}", "Flamme en zone verte{lieu}", "Incendie végétal{lieu}"],
  flood: ["Inondation{lieu}", "Crues et montée des eaux{lieu}", "Risque inondation{lieu}", "Submersion localisée{lieu}", "Ruissellement et inondations{lieu}", "Hausse rapide des cours d'eau{lieu}", "Débordement{lieu}", "Crue soudaine{lieu}", "Montée des eaux{lieu}", "Inondations torrentielles{lieu}"],
  storm: ["Tempête et orages violents{lieu}", "Événement climatique{lieu}", "Orages et vents forts{lieu}", "Rafales et précipitations{lieu}", "Perturbation atmosphérique{lieu}", "Orage violent{lieu}", "Épisode orageux{lieu}", "Tempête de vent{lieu}", "Rafales orageuses{lieu}", "Perturbation météo{lieu}"],
  road: ["Accident routier{lieu}", "Accident sur la voie publique{lieu}", "Collision routière{lieu}", "Sortie de route{lieu}", "Accident de circulation{lieu}", "Accident impliquant plusieurs véhicules{lieu}", "Accident VL{lieu}", "Accident poids lourd{lieu}", "Collision sur route{lieu}", "Accident et embouteillage{lieu}"],
  industrial: ["Incident industriel{lieu}", "Événement sur site industriel{lieu}", "Alerte site sensible{lieu}", "Sinistre industriel{lieu}", "Incident sur installation classée{lieu}", "Accident du travail{lieu}", "Fuite produit{lieu}", "Alerte industrielle{lieu}", "Incident usine{lieu}", "Événement site SEVESO{lieu}"],
  explosion: ["Explosion{lieu}", "Incident avec déflagration{lieu}", "Déflagration{lieu}", "Explosion sur site{lieu}", "Souffle et débris{lieu}", "Explosion accidentelle{lieu}", "Explosion gaz{lieu}", "Déflagration{lieu}", "Explosion et incendie{lieu}", "Souffle violent{lieu}"],
  epidemic: ["Alerte sanitaire{lieu}", "Cluster épidémique suspecté{lieu}", "Cas groupés suspectés{lieu}", "Événement sanitaire{lieu}", "Foyer épidémique{lieu}", "Foyer infectieux{lieu}", "Cas suspect groupés{lieu}", "Alerte cluster{lieu}", "Épisode infectieux{lieu}", "Investigation sanitaire{lieu}"],
  drought: ["Sécheresse{lieu}", "Situation de sécheresse{lieu}", "Épisode de sécheresse{lieu}", "Pénurie d'eau{lieu}", "Sécheresse agricole{lieu}", "Alimentation en eau dégradée{lieu}", "Sécheresse prolongée{lieu}", "Pénurie hydrique{lieu}", "Baisse du niveau des nappes{lieu}", "Restriction eau potable{lieu}"],
  heatwave: ["Vague de chaleur{lieu}", "Épisode caniculaire{lieu}", "Chaleur extrême{lieu}", "Températures exceptionnelles{lieu}", "Canicule{lieu}", "Vagues de chaleur{lieu}", "Chaleur record{lieu}", "Épisode de chaleur{lieu}", "Pic de chaleur{lieu}", "Chaleur intense{lieu}"],
  missing: ["Disparition{lieu}", "Personne disparue{lieu}", "Recherche de personne disparue{lieu}", "Alerte disparition{lieu}", "Disparition inquiétante{lieu}", "Fugue{lieu}", "Recherche personne{lieu}", "Alerte recherche{lieu}", "Disparu{lieu}", "Enfant disparu{lieu}"],
  cbrn: ["Incident CBRN{lieu}", "Risque chimique / radiologique{lieu}", "Fuite suspectée{lieu}", "Alerte produit dangereux{lieu}", "Fuite chimique{lieu}", "Incident radiologique{lieu}", "Exposition produit toxique{lieu}", "Alerte NRBC{lieu}", "Contamination suspectée{lieu}", "Risque toxique{lieu}"],
};
const TITLE_POOL_GEN = ["Signalement{lieu}", "Événement{lieu}", "Incident{lieu}", "Intervention{lieu}", "Alerte{lieu}", "Situation{lieu}", "Opération{lieu}", "Point de situation{lieu}"];

const DESC_POOL: Record<string, DescPair[]> = {
  earthquake: [
    { l1: "Un épisode sismique a été ressenti{lieuDet} ; l'intensité exacte et l'épicentre sont en cours de confirmation par les services spécialisés.", l2: "Équipes déployées pour évaluer le bilan humain et matériel, évacuation préventive des bâtiments les plus exposés si nécessaire." },
    { l1: "Séisme enregistré{lieuDet} ; vibrations ressenties dans plusieurs communes alentours selon premières informations terrain.", l2: "Mise en place d'un périmètre de sécurité autour des zones à risque, activation du plan de continuité et suivi continu des répliques potentielles." },
    { l1: "Secousse tellurique{lieuDet} — intensité en cours d'évaluation par les autorités.", l2: "Reconnaissance rapide des bâtiments publics et des infrastructures routières à proximité ; recensement immédiat des dégâts visibles." },
    { l1: "Activité sismique{lieuDet} signalée par plusieurs témoins.", l2: "Population invitée à rester prudente ; équipes techniques mobilisées pour contrôler la stabilité des ouvrages à proximité." },
    { l1: "Réplique sismique{lieuDet} après événement principal antérieur.", l2: "Renforcement du suivi des zones endommagées ; évacuation préventive des bâtiments fragiles et coordination avec l'ensemble des acteurs." },
    { l1: "Tremblement de terre{lieuDet} — premières estimations de magnitude en attente.", l2: "Dispositif de secours prépositionné, prise en charge médicale immédiate des victimes potentielles et ouverture d'un point d'accueil." },
  ],
  wildfire: [
    { l1: "Départ de feu détecté{lieuDet} dans une zone à végétation dense ; propagation en cours selon les premières observations.", l2: "Intervention des moyens terrestres et aériens en cours ; évacuation préventive des habitations les plus exposées si nécessaire." },
    { l1: "Foyer d'incendie{lieuDet} signalé en zone de maquis, orientation variable selon le vent.", l2: "Déploiement des pompiers, appui aérien et protection des habitations ; alerte aux riverains de la zone concernée." },
    { l1: "Incendie de végétation{lieuDet} en propagation ; surface brûlée en cours d'évaluation.", l2: "Évacuation préventive des habitations proches ; montée en puissance des moyens et coordination avec la météorologie pour l'évolution du vent." },
    { l1: "Départ de feu de forêt{lieuDet} — alerte transmise à la colonne mobile.", l2: "Intervention rapide pour circonscrire le foyer ; appui logistique et suivi météorologique horaire." },
    { l1: "Feu de broussailles{lieuDet} risque propagation si le vent se lève.", l2: "Périmètre de sécurité autour de la zone, protection des habitations proches et patrouilles anti-rallumage." },
    { l1: "Feu de forêt{lieuDet} — plusieurs foyers secondaires détectés.", l2: "Montée en puissance des moyens, découpage des foyers et priorisation des zones à habitat." },
  ],
  flood: [
    { l1: "Montée rapide des eaux{lieuDet} ; plusieurs points bas commencent à être inondés.", l2: "Mise en place de périmètres de sécurité, évacuation préventive des populations riveraines et prépositionnement de moyens de secours nautiques." },
    { l1: "Crue soudaine{lieuDet} avec augmentation rapide du niveau des cours d'eau.", l2: "Intervention nautique, évacuation des zones inondables et renforcement des digues si nécessaire." },
    { l1: "Inondation{lieuDet} causée par des pluies intenses et durables.", l2: "Reconnaissance par bateau, recensement des isolés, prise en charge sanitaire et montée en puissance du dispositif." },
    { l1: "Risque d'inondation{lieuDet} — seuil critique atteint sur un cours d'eau voisin.", l2: "Alerte des communes, préparation d'évacuations préventives et prépositionnement de sables et matériel d'endiguement." },
    { l1: "Débordement{lieuDet} de la voie d'eau après orages violents.", l2: "Périmètres de sécurité, fermetures de routes et mise à l'abri des populations riveraines immédiates." },
    { l1: "Submersion{lieuDet} progressive sur plusieurs communes.", l2: "Coordination des secours nautiques, ouverture de centres d'hébergement et suivi hydrologique en continu." },
  ],
  storm: [
    { l1: "Orages et vents violents{lieuDet} avec chutes d'arbres et dégâts sur le réseau électrique selon les premiers retours terrain.", l2: "Déploiement d'équipes pour sécuriser les axes, rétablir les réseaux et porter secours aux populations impactées." },
    { l1: "Perturbation météorologique{lieuDet} avec rafales et précipitations orageuses.", l2: "Sécurisation des sites publics, patrouilles pour dégager les axes et appui aux gestionnaires de réseaux." },
    { l1: "Épisode orageux{lieuDet} — chutes de grêle possibles sur la zone.", l2: "Protection des zones exposées, prise en charge des blessés légers et surveillance des toitures et vitrages endommagés." },
    { l1: "Vents violents{lieuDet} — plusieurs arbres couchés sur des axes secondaires.", l2: "Équipes de débouchage mobilisées, fermeture préventive des routes touchées et remise en état des réseaux aériens." },
    { l1: "Tempête{lieuDet} — alerte météo orange en cours sur le secteur.", l2: "Renforcement des équipes d'astreinte, prépositionnement du matériel d'urgence et suivi de l'évolution des vents et inondations associées." },
    { l1: "Orage violent{lieuDet} avec risque d'éclairs et surtensions.", l2: "Protection des victimes, sécurisation des installations sensibles et soutien aux communes impactées." },
  ],
  road: [
    { l1: "Accident sur la voie publique{lieuDet} impliquant au moins un véhicule ; bilan humain en cours d'évaluation.", l2: "Mise en place d'un périmètre de sécurité, prise en charge des victimes et dégagement de la chaussée pour rétablir la circulation." },
    { l1: "Collision routière{lieuDet} — plusieurs véhicules impliqués d'après témoins.", l2: "Prise en charge médicale urgente, relevage des véhicules et signalisation du site pour éviter l'accumulation." },
    { l1: "Accident{lieuDet} — sortie de route avec véhicule en bordure de chaussée.", l2: "Extrications si nécessaire, prise en charge du conducteur et sécurisation du tronçon avant dégagement." },
    { l1: "Accident poids lourd{lieuDet} risque de déversement marchandise.", l2: "Spécialistes marchandises dangereuses alertés, périmètre élargi et expertise du chargement avant toute manœuvre." },
    { l1: "Piéton heurté{lieuDet} — personne blessée en cours de prise en charge.", l2: "SMUR et SAMU mobilisés, sécurisation du croisement et auditions de témoins par les enquêteurs." },
    { l1: "Accident deux roues{lieuDet} — usager vulnérable.", l2: "Intervention rapide médicale, sécurisation du site et relevés techniques pour déterminer les circonstances exactes." },
  ],
  industrial: [
    { l1: "Incident sur site industriel{lieuDet} ; mesure des niveaux de risque et confinement préventif en cours.", l2: "Intervention spécialisée, identification des risques potentiels pour les populations riveraines et coordination avec les services de l'État." },
    { l1: "Fuite produit{lieuDet} sur un site industriel ; nature du produit en cours d'identification.", l2: "Périmètre de sécurité adapté, prise en charge des employés exposés et mesures de décontamination si nécessaire." },
    { l1: "Alerte site sensible{lieuDet} — détection anormale dans les capteurs de sécurité.", l2: "Équipes d'intervention spécialisées mobilisées, vérifications instrumentées et population riveraine invitée à rester confinée si besoin." },
    { l1: "Incendie sur site industriel{lieuDet} — risque d'extension aux cuves ou stockages.", l2: "Moyens lourds de lutte contre l'incendie, périmètre de sécurité et alerte aux populations avoisinantes." },
    { l1: "Accident du travail{lieuDet} — intervention dans un site de production.", l2: "Prise en charge médicale immédiate de la victime, enquête circonstanciée et sécurité renforcée sur le site." },
    { l1: "Risque SEVESO{lieuDet} — incident nécessitant l'activation du PPI.", l2: "Coordination préfectorale, informations aux riverains et déclenchement des mesures d'urgence du plan particulier d'intervention." },
  ],
  explosion: [
    { l1: "Explosion{lieuDet} suivie de dégâts matériels ; origine en cours de détermination.", l2: "Périmètre de sécurité immédiat, prise en charge des victimes et recherche de survivants parmi les débris." },
    { l1: "Déflagration{lieuDet} — souffle entendu dans un large périmètre.", l2: "Intervention multi-services, repérage des blessés, évacuation préventive des bâtiments adjacents et enquête technique." },
    { l1: "Explosion gaz{lieuDet} — fuite possible d'une conduite ou bouteille.", l2: "Fermeture des arrivées de gaz au secteur, sécurisation incendie et prise en charge des victimes exposées au souffle." },
    { l1: "Explosion et incendie{lieuDet} secondaire après déflagration.", l2: "Priorisation des secours aux personnes puis maîtrise des foyers d'incendie dans les débris." },
    { l1: "Souffle violent{lieuDet} — nombreuses vitres et façades endommagées.", l2: "Mise en sécurité des riverains, recensement des blessés et nettoyage sécurisé des voiries." },
    { l1: "Explosion sur site{lieuDet} — intervention en zone potentiellement confinée.", l2: "Reconnaissance des risques toxiques, équipement CBRN si nécessaire et extraction des victimes potentielles." },
  ],
  epidemic: [
    { l1: "Cas groupés suspectés{lieuDet} avec un tableau clinique compatible ; investigations épidémiologiques en cours.", l2: "Activation des dispositifs de veille sanitaire, prise en charge médicale des cas et mesures de prévention autour de la zone." },
    { l1: "Foyer épidémique{lieuDet} — premiers cas identifiés dans une structure collective.", l2: "Isolement des cas, traçabilité des contacts et renforcement des mesures d'hygiène sur le site." },
    { l1: "Cluster suspecté{lieuDet} — investigation épidémiologique immédiate.", l2: "Tests de dépistage, isolement préventif et informations aux populations vulnérables du secteur." },
    { l1: "Foyer infectieux{lieuDet} dans une école, EHPAD ou site de rassemblement.", l2: "Fermeture temporaire du site si nécessaire, désinfection renforcée et suivi sanitaire des personnes exposées." },
    { l1: "Alerte sanitaire{lieuDet} — signalement de cas inhabituels.", l2: "Coordination avec les services de santé et hôpitaux proches, montée en puissance du dispositif d'alerte et préparation lits." },
    { l1: "Investigation sanitaire{lieuDet} après signalement de symptômes groupés.", l2: "Recherche étiologique rapide, prise en charge des malades et renforcement des barrières hygiéniques dans les lieux publics." },
  ],
  drought: [
    { l1: "Situation de sécheresse{lieuDet} avec dégradation progressive de la ressource en eau potable et agricole.", l2: "Intervention déclenchée : évaluation du niveau des nappes et réserves, mise en place de restrictions adaptées et soutien aux populations les plus exposées." },
    { l1: "Perturbation de l'alimentation en eau{lieuDet} liée à une sécheresse prolongée.", l2: "Reconnaissance terrain, périmètre de sécurité autour des points d'eau, plan de distribution d'eau potable par camion-citerne si besoin." },
    { l1: "Sécheresse{lieuDet} et impact sur l'agriculture et le bétail.", l2: "Évaluation du cheptel et des cultures, soutien logistique et mise en œuvre de mesures d'urgence pour l'abreuvement et récolte." },
    { l1: "Pénurie hydrique{lieuDet} — niveau des nappes phréatiques bas.", l2: "Renforcement du suivi des captages, coordination avec les gestionnaires de réseau et campagnes d'économie d'eau sur le territoire." },
    { l1: "Restriction eau potable{lieuDet} — mise en place de mesures arrêtées par les autorités.", l2: "Contrôles terrain, information des usagers et organisation de la distribution d'appui par camion-citerne pour les communes touchées." },
    { l1: "Sécheresse prolongée{lieuDet} — risque incendie forêt aggravé.", l2: "Renforcement des patrouilles de surveillance forêt, alerte aux populations et prépositionnement de moyens d'extinction préventifs." },
  ],
  heatwave: [
    { l1: "Vague de chaleur{lieuDet} avec températures exceptionnelles prévues sur plusieurs jours.", l2: "Déploiement d'un dispositif de surveillance des populations vulnérables, activation des espaces rafraîchis et coordination avec les centres hospitaliers." },
    { l1: "Canicule{lieuDet} — vigilance orange ou rouge selon prévisions.", l2: "Appels et visites aux personnes âgées isolées, distribution d'eau et ouverture 24/24 des lieux rafraîchis." },
    { l1: "Chaleur extrême{lieuDet} — coup de chaleur possible chez les personnes vulnérables.", l2: "Prise en charge médicale précoce des cas suspects, sensibilisation aux risques et appui aux structures d'accueil." },
    { l1: "Pic de chaleur{lieuDet} — augmentation rapide de la température.", l2: "Organisation de la surveillance horaire des populations à risque ; coordination avec SAMU pour transports médicalisés si besoin." },
    { l1: "Températures élevées{lieuDet} sur plusieurs jours d'affilée.", l2: "Ouverture de fontaines publiques, désinfection des lieux de rassemblement et communication usagers sur les bons gestes." },
    { l1: "Épisode caniculaire{lieuDet} — impact sur l'activité professionnelle extérieure.", l2: "Information des employeurs sur les consignes de sécurité, soutien aux chantiers et contrôle des conditions de travail." },
  ],
  missing: [
    { l1: "Signalement de disparition{lieuDet} ; circonstances de la disparition en cours d'investigation.", l2: "Déploiement de patrouilles de recherche sur la zone, activation du dispositif d'alerte et coordination avec les enquêteurs." },
    { l1: "Personne disparue{lieuDet} disparition inquiétante, profil vulnérable.", l2: "Rassemblement des informations ; recherches hélicoptère possible si les conditions le permettent ; activation alerte disparition." },
    { l1: "Fugue{lieuDet} — mineur ou adulte ; connaissance du territoire.", l2: "Équipes cynophiles et patrouilles pédestres ; entretiens avec l'entourage et diffusion du signalement." },
    { l1: "Disparition en montagne{lieuDet} ou zone rurale difficile d'accès.", l2: "Mobilisation gendarmerie, secours en montagne et hélicoptère ; cartographie fine des derniers lieux de passage." },
    { l1: "Recherche personne âgée{lieuDet} — personne désorientée sortie d'EHPAD ou domicile.", l2: "Déploiement multi-services : alerte voisinage, patrouilles itinéraires connus, préparation prise en charge médicale à la localisation." },
    { l1: "Enfant disparu{lieuDet} — inquiétude immédiate des proches.", l2: "Dispositif de recherche mobilisé en priorité maximale ; alerte diffusion large et patrouilles secteur." },
  ],
  cbrn: [
    { l1: "Fuite ou exposition suspecte{lieuDet} à un produit chimique / radiologique.", l2: "Mise en place d'un périmètre de sécurité CBRN, prise en charge des victimes avec décontamination si nécessaire et analyse des risques." },
    { l1: "Fuite chimique{lieuDet} — odeur et symptômes rapportés par témoins.", l2: "Confinement des riverains au vent opposé, décontamination des personnes exposées et mesures d'urgence NRBC." },
    { l1: "Incident NRBC{lieuDet} — agents biologiques ou toxiques soupçonnés.", l2: "Équipement NRBC complet des intervenants, périmètres de zone chaude / froide et soutien laboratoire." },
    { l1: "Produit toxique{lieuDet} — déversement accidentel sur une zone.", l2: "Intervention spécialisée, barrières de confinement et neutralisation ; suivi qualité de l'air et de l'eau." },
    { l1: "Risque radiologique{lieuDet} — source orpaille ou détecteur anormal.", l2: "Gendarmerie spécialisée, expertise radiologique et confinement préventif autour du secteur." },
    { l1: "Contamination suspectée{lieuDet} — plusieurs cas de maux de tête ou irritations.", l2: "Décontamination immédiate, analyse atmosphérique et enquête pour identifier la source et les exposés." },
  ],
};
const DESC_POOL_GEN: DescPair[] = [
  { l1: "Intervention déclenchée{lieuDet} suite à un signalement concernant un {label}.", l2: "Périmètre de sécurité, reconnaissance et évaluation complète de la situation en cours par les responsables de secteur." },
  { l1: "Événement signalé{lieuDet} — opérations de prise en charge immédiate initiées.", l2: "Coordination opérationnelle des moyens engagés et maintien du commandement pour le suivi de l'incident." },
  { l1: "Intervention en cours{lieuDet} pour gestion d'un événement.", l2: "Montée en puissance adaptative ; informations régulières aux autorités et populations riveraines." },
  { l1: "Alerte{lieuDet} transmission validée par le commandement.", l2: "Moyens déployés pour reconnaissance et sécurisation ; point de situation prévu à 30 minutes." },
  { l1: "Situation{lieuDet} — prise en charge par le CODIS.", l2: "Sécurisation du site, prise en charge des victimes et préparation du retour à la normale." },
  { l1: "Opération{lieuDet} — intervention multi-services coordonnée.", l2: "Recensement des moyens, bilans humain et matériel transmis à la cellule de crise." },
];

/* ===================== PICKERS INDÉPENDANTS TITRE / DESCRIPTION ===================== */

/** Pick TITRE — seed TOTALEMENT SÉPARÉ du picker description. */
function pickTitle(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const titles = TITLE_POOL[input.type] ?? TITLE_POOL_GEN;
  const tTpl = titles[rngSeed(salt * 131 + titles.length * 17 + 7, titles.length)] ?? TITLE_POOL_GEN[0];
  return inject(tTpl as string, label, lieu).replace(/\s+/g, " ").trim();
}

/** Pick DESCRIPTION 2-lignes — seed TOTALEMENT SÉPARÉ du picker titre. */
function pickDesc(input: DescriptionProposalInput, salt: number): string {
  if (!input.type) return "";
  const label = labelOf(input);
  const lieu = lieuOf(input);
  const descs = DESC_POOL[input.type] ?? DESC_POOL_GEN;
  const dTpl = (descs[rngSeed(salt * 271 + descs.length * 53 + 11, descs.length)] as DescPair) ?? DESC_POOL_GEN[0];
  return buildDesc(dTpl, label, lieu);
}

/* ============== HOOK PRINCIPAL : 2 COMPTEURS / 2 SETTERS SÉPARÉS ============== */

export function useDraftProposal(
  input: DescriptionProposalInput,
  opts?: {
    currentTitle: string;
    currentDesc: string;
    autoApplyIfEmpty?: boolean;
    setTitle: (t: string) => void;
    setDesc: (d: string) => void;
  },
) {
  /* === 2 COMPTEURS TOTALEMENT INDÉPENDANTS === */
  const [regenT, setRegenT] = useState(1); // incrément → change SEULEMENT TITRE
  const [regenD, setRegenD] = useState(1); // incrément → change SEULEMENT DESCRIPTION

  /* Derniers saltes appliqués (évite boucles infinies et réécriture inutile) */
  const prevSaltT = useRef(0);
  const prevSaltD = useRef(0);
  const firstInitDone = useRef(false);

  /* === 2 useMemo SÉPARÉS : TITRE dépend de regenT, DESC dépend de regenD === */
  const titleProposal = useMemo(() => pickTitle(input, regenT), [
    input.type, input.adresse, input.province, input.ville, input.pt,
    input.lang, input.incidentTypes, regenT,
  ]);
  const descProposal = useMemo(() => pickDesc(input, regenD), [
    input.type, input.adresse, input.province, input.ville, input.pt,
    input.lang, input.incidentTypes, regenD,
  ]);

  const proposal: Proposal = { title: titleProposal, desc: descProposal };

  const titleUsed = Boolean(
    opts && opts.currentTitle.trim() === titleProposal.trim() && titleProposal,
  );
  const descUsed = Boolean(
    opts && opts.currentDesc.trim() === descProposal.trim() && descProposal,
  );

  /* === SETTER SEUL TITRE (quand regenT change et diff de prevSalt) === */
  useEffect(() => {
    if (!opts || !input.type) return;
    if (regenT !== prevSaltT.current) {
      // CAS 1 : ⟳ titre a été appuyé (nouveau salt) → met à jour SEULEMENT setTitle
      if (regenT > 1) {
        if (titleProposal) opts.setTitle(titleProposal);
      } else if (opts.autoApplyIfEmpty && !firstInitDone.current && !opts.currentTitle.trim()) {
        // CAS 2 : 1er chargement, champ TITRE vide → auto-apply
        if (titleProposal) opts.setTitle(titleProposal);
      }
      prevSaltT.current = regenT;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenT, input.type]);

  /* === SETTER SEUL DESCRIPTION (quand regenD change et diff de prevSalt) === */
  useEffect(() => {
    if (!opts || !input.type) return;
    if (regenD !== prevSaltD.current) {
      if (regenD > 1) {
        if (descProposal) opts.setDesc(descProposal);
      } else if (opts.autoApplyIfEmpty && !firstInitDone.current && !opts.currentDesc.trim()) {
        if (descProposal) opts.setDesc(descProposal);
      }
      prevSaltD.current = regenD;
    }
    firstInitDone.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regenD, input.type]);

  /* === 2 REGEN SÉPARÉES === */
  const regenFreshT = useCallback(() => setRegenT((x) => x + 1), []);
  const regenFreshD = useCallback(() => setRegenD((x) => x + 1), []);

  /* === 2 APPLY SÉPARÉES === */
  const applyTitle = useCallback(
    () => { if (titleProposal && opts) opts.setTitle(titleProposal); },
    [titleProposal, opts],
  );
  const applyDesc = useCallback(
    () => { if (descProposal && opts) opts.setDesc(descProposal); },
    [descProposal, opts],
  );

  return {
    proposal,
    // 2 régénérations exposées séparément
    regenFreshT,
    regenFreshD,
    // 2 applies exposées séparément
    applyTitle,
    applyDesc,
    // anciennes signatures pour rétro-compatibilité
    regenFresh: regenFreshT,
    titleUsed,
    descUsed,
  };
}

/* ============== COMPOSANTS BOUTONS INTÉGRÉS DANS LES CHAMPS ============== */

const BTN_BASE =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors";

function AssistButtons(props: {
  label: string;
  onApply: () => void;
  onRegen: () => void;
  applied: boolean;
  disabled?: boolean;
}): ReactNode {
  const { label, onApply, onRegen, applied, disabled } = props;
  return (
    <div className="flex shrink-0 items-center gap-1" aria-label={`Assistant IA · ${label}`}>
      <button
        type="button"
        onClick={onApply}
        disabled={disabled || applied}
        title={applied ? `Proposition ${label} déjà appliquée` : `Appliquer la proposition IA · ${label}`}
        className={cn(
          BTN_BASE,
          applied
            ? "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
            : "border-or-500/25 bg-or-500/8 text-or-700 hover:bg-or-500/16 dark:text-or-300",
          disabled ? "cursor-not-allowed opacity-40" : "",
        )}
      >
        <Icon path={applied ? UI_ICONS.check : UI_ICONS.sparkles} className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onRegen}
        disabled={disabled}
        title={`Régénérer la proposition IA · ${label} — uniquement ${label.toLowerCase()}`}
        className={cn(
          BTN_BASE,
          "border-gray-300/80 bg-white/90 text-gray-700 hover:bg-gray-100 dark:border-white/10 dark:bg-white/[0.06] dark:text-rdia-200 dark:hover:bg-white/[0.12]",
          disabled ? "cursor-not-allowed opacity-40" : "",
        )}
      >
        <Icon path={UI_ICONS.refresh} className="h-3 w-3" />
      </button>
    </div>
  );
}

export function TitleAssistButtons(props: {
  onApply: () => void;
  onRegen: () => void;
  applied: boolean;
  disabled?: boolean;
}): ReactNode {
  return <AssistButtons label="Titre" {...props} />;
}

export function DescAssistButtons(props: {
  onApply: () => void;
  onRegen: () => void;
  applied: boolean;
  disabled?: boolean;
}): ReactNode {
  return <AssistButtons label="Description" {...props} />;
}

/* ============== RETRO-COMPAT (ancien composant → affiche RIEN) ============== */
export function IncidentDraftAssist(): ReactNode {
  return null;
}
