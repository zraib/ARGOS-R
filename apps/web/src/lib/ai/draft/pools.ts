// ============================================================================
// lib/ai/draft/pools.ts — réserves de formulations de secours
//
// Servent quand le moteur sémantique n'a rien de solide à relier : des
// tournures neutres, jamais un fait.
// Logique PURE, sans React : extraite de IncidentDraftAssist.tsx pour être
// testée seule et réutilisée par le brouillon LLM (lib/ai/llmIncidentDraft.ts)
// sans qu'une bibliothèque n'importe plus un composant.
// ============================================================================

import type { DescPair } from "./types";

export const TITLE_POOL: Record<string, string[]> = {
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
export const TITLE_POOL_GEN = ["Signalement{lieu}", "Événement{lieu}", "Incident{lieu}", "Intervention{lieu}", "Alerte{lieu}", "Situation{lieu}", "Opération{lieu}", "Point de situation{lieu}"];

/* =========================================================================
   DESC_POOL — FALLBACK 100% SANS INVENTION (tokens.length === 0)
   RÈGLE : AUCUNE action opérationnelle, AUCUN moyen, AUCUNE mesure, AUCUN
   chiffre précis. Uniquement des phrases neutres décrivant le niveau
   d'information disponible (zéro déduction, zéro suggestion).
   En cas de doute, une phrase générique « informations à compléter » est
   préférée à toute tournure qui pourrait suggérer un déploiement, un
   périmètre, une évacuation ou une reconnaissance non explicitement
   cités par l'opérateur dans les mots-clés.
   ========================================================================= */
export const DESC_POOL: Record<string, DescPair[]> = {
  earthquake: [
    { l1: "Un phénomène sismique est signalé{lieuDet} ; intensité et épicentre restent à préciser par les éléments complémentaires.", l2: "Informations en cours de consolidation ; bilan humain et matériel à compléter." },
    { l1: "Séisme mentionné{lieuDet} — les caractéristiques précises n'ont pas encore été transmises.", l2: "Signalement enregistré ; données à enrichir auprès des sources disponibles." },
    { l1: "Secousse tellurique{lieuDet} rapportée — intensité en attente de confirmation.", l2: "Niveau d'information initial ; éléments à compléter par les services concernés." },
    { l1: "Activité sismique{lieuDet} mentionnée par plusieurs sources.", l2: "Signalement pris en compte ; données complémentaires à recueillir." },
    { l1: "Réplique sismique{lieuDet} — événement secondaire signalé.", l2: "Informations préliminaires ; évaluation complète du contexte à réaliser." },
    { l1: "Tremblement de terre{lieuDet} — intensité exacte en attente.", l2: "Premier niveau d'information transmis ; éléments à vérifier." },
  ],
  wildfire: [
    { l1: "Départ de feu mentionné{lieuDet} dans une zone de végétation ; éléments de propagation non consolidés.", l2: "Signalement enregistré ; données à compléter." },
    { l1: "Foyer d'incendie{lieuDet} rapporté — orientation et surface à préciser.", l2: "Informations préliminaires ; contexte à enrichir." },
    { l1: "Incendie de végétation{lieuDet} — surface brûlée inconnue à ce stade.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Départ de feu de forêt{lieuDet} — signalement transmis.", l2: "Données à vérifier ; bilan à établir." },
    { l1: "Feu de broussailles{lieuDet} mentionné — contexte à préciser.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Feu de forêt{lieuDet} — foyers secondaires signalés sans confirmation consolidée.", l2: "Éléments recueillis ; consolidation attendue." },
  ],
  flood: [
    { l1: "Montée des eaux{lieuDet} mentionnée — niveau et zones touchées à préciser.", l2: "Signalement pris en compte ; données à enrichir." },
    { l1: "Crue{lieuDet} rapportée — vitesse d'évolution inconnue.", l2: "Informations préliminaires ; éléments complémentaires à recueillir." },
    { l1: "Inondation{lieuDet} signalée — origine pluie ou débordement à clarifier.", l2: "Niveau d'information initial ; contexte à vérifier." },
    { l1: "Risque d'inondation{lieuDet} — seuil évoqué sans mesure précise.", l2: "Éléments transmis ; consolidation des données requise." },
    { l1: "Débordement{lieuDet} de voie d'eau mentionné.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Submersion{lieuDet} — nombre de zones concernées à préciser.", l2: "Contexte préliminaire ; éléments en attente de confirmation." },
  ],
  storm: [
    { l1: "Orages et vents{lieuDet} — intensité et effets rapportés sans consolidation.", l2: "Signalement enregistré ; données à vérifier." },
    { l1: "Perturbation météorologique{lieuDet} mentionnée — rafales et précipitations évoquées.", l2: "Informations préliminaires ; contexte à enrichir." },
    { l1: "Épisode orageux{lieuDet} — éléments de violence restant à préciser.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Vents violents{lieuDet} — effets sur les axes et ouvrages évoqués.", l2: "Données transmises ; consolidation requise." },
    { l1: "Tempête{lieuDet} — niveau de vigilance mentionné sans confirmation.", l2: "Premiers éléments ; informations à compléter." },
    { l1: "Orage violent{lieuDet} — risques associés évoqués.", l2: "Éléments recueillis ; vérifications complémentaires nécessaires." },
  ],
  road: [
    { l1: "Accident sur voie publique{lieuDet} — nombre de véhicules et bilan à préciser.", l2: "Signalement enregistré ; données à enrichir." },
    { l1: "Collision routière{lieuDet} rapportée — circonstances à clarifier.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Accident{lieuDet} — sortie de route mentionnée.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Incident poids lourd{lieuDet} — nature de la marchandise inconnue.", l2: "Données transmises ; consolidation requise." },
    { l1: "Piéton heurté{lieuDet} — gravité et circonstances à préciser.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Accident deux roues{lieuDet} — profil et contexte évoqués.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  industrial: [
    { l1: "Incident sur site industriel{lieuDet} — nature et niveau de risque à préciser.", l2: "Signalement pris en compte ; données à enrichir." },
    { l1: "Fuite produit{lieuDet} rapportée — nature du produit inconnue.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Alerte site sensible{lieuDet} — détection évoquée sans détail instrumenté.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Incendie sur site industriel{lieuDet} — extension potentielle évoquée.", l2: "Données transmises ; consolidation requise." },
    { l1: "Accident du travail{lieuDet} — contexte restant à préciser.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Risque SEVESO{lieuDet} — activation de plan mentionnée sans confirmation.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  explosion: [
    { l1: "Explosion{lieuDet} suivie de dégâts matériels — origine inconnue.", l2: "Signalement enregistré ; données à enrichir." },
    { l1: "Déflagration{lieuDet} rapportée — périmètre perceptible évoqué.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Explosion gaz{lieuDet} — hypothèse de fuite mentionnée.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Explosion et incendie{lieuDet} — ordre de survenue à clarifier.", l2: "Données transmises ; consolidation requise." },
    { l1: "Souffle violent{lieuDet} — effets sur façades évoqués.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Explosion sur site{lieuDet} — accessibilité de la zone inconnue.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  epidemic: [
    { l1: "Cas groupés suspectés{lieuDet} — tableau clinique compatible évoqué.", l2: "Signalement pris en compte ; investigations à conduire." },
    { l1: "Foyer épidémique{lieuDet} — cadre de survenue mentionné.", l2: "Informations préliminaires ; contexte à enrichir." },
    { l1: "Cluster suspecté{lieuDet} — signalement transmis.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Foyer infectieux{lieuDet} — lieu de survenue évoqué.", l2: "Données transmises ; consolidation requise." },
    { l1: "Alerte sanitaire{lieuDet} — cas inhabituels mentionnés.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Investigation sanitaire{lieuDet} — symptômes groupés évoqués.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  drought: [
    { l1: "Situation de sécheresse{lieuDet} — évolution de la ressource évoquée.", l2: "Signalement enregistré ; données à enrichir." },
    { l1: "Perturbation alimentation en eau{lieuDet} — contexte de sécheresse mentionné.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Sécheresse{lieuDet} — secteurs agricole et potable évoqués.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Pénurie hydrique{lieuDet} — niveau des nappes évoqué.", l2: "Données transmises ; consolidation requise." },
    { l1: "Restriction eau potable{lieuDet} — mesure signalée.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Sécheresse prolongée{lieuDet} — risque associé mentionné sans détail.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  heatwave: [
    { l1: "Vague de chaleur{lieuDet} — intensité et durée prévues évoquées.", l2: "Signalement enregistré ; données à enrichir." },
    { l1: "Canicule{lieuDet} — niveau de vigilance mentionné.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Chaleur extrême{lieuDet} — populations vulnérables évoquées.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Pic de chaleur{lieuDet} — dynamique d'évolution mentionnée.", l2: "Données transmises ; consolidation requise." },
    { l1: "Températures élevées{lieuDet} — durée évoquée.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Épisode caniculaire{lieuDet} — activité extérieure concernée mentionnée.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  missing: [
    { l1: "Signalement de disparition{lieuDet} — circonstances à clarifier.", l2: "Signalement pris en compte ; données à enrichir." },
    { l1: "Personne disparue{lieuDet} — profil mentionné.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Fugue{lieuDet} — éléments de contexte restant à préciser.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Disparition zone difficile{lieuDet} — localisation à consolider.", l2: "Données transmises ; consolidation requise." },
    { l1: "Recherche personne âgée{lieuDet} — profil vulnérable évoqué.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Enfant disparu{lieuDet} — signalement transmis.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
  cbrn: [
    { l1: "Fuite ou exposition suspecte{lieuDet} — famille de produit à préciser.", l2: "Signalement enregistré ; données à enrichir." },
    { l1: "Fuite chimique{lieuDet} — odeur et symptômes évoqués.", l2: "Informations préliminaires ; contexte à vérifier." },
    { l1: "Incident NRBC{lieuDet} — nature de l'agent inconnue.", l2: "Niveau d'information initial ; éléments complémentaires attendus." },
    { l1: "Produit toxique{lieuDet} — déversement mentionné.", l2: "Données transmises ; consolidation requise." },
    { l1: "Risque radiologique{lieuDet} — source évoquée.", l2: "Premier signalement ; informations à compléter." },
    { l1: "Contamination suspectée{lieuDet} — cas groupés mentionnés.", l2: "Éléments préliminaires ; vérifications complémentaires nécessaires." },
  ],
};
export const DESC_POOL_GEN: DescPair[] = [
  { l1: "Signalement transmis{lieuDet} — type {label} mentionné.", l2: "Informations préliminaires ; éléments complémentaires attendus." },
  { l1: "Événement{lieuDet} — premier niveau d'information transmis.", l2: "Données en attente de consolidation ; contexte à enrichir." },
  { l1: "Cas signalé{lieuDet} — nature précisée.", l2: "Niveau d'information initial ; vérifications à conduire." },
  { l1: "Alerte{lieuDet} — transmission validée.", l2: "Éléments enregistrés ; données complémentaires requises." },
  { l1: "Situation{lieuDet} — contexte mentionné sans détail.", l2: "Premiers éléments recueillis ; informations à compléter." },
  { l1: "Opération{lieuDet} — signalement pris en compte.", l2: "Données préliminaires ; consolidation attendue." },
];

/* ===================== PICKERS INDÉPENDANTS TITRE / DESCRIPTION ===================== */

/** Pick TITRE — si keywords présents, construit via buildSemanticTitle. */
