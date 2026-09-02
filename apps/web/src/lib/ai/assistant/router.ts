// ============================================================================
// ARGOS — assistant IA · Le routeur d'intentions : `interpret()` — la seule entrée du moteur déterministe.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { classifyIncSubIntent, resolveTarget } from "./enrich";
import { equipmentCriticalStatus, equipmentSearch } from "./intents/equipment";
import { hospitalsNearest, hospitalsStatus, reachability } from "./intents/hospitals";
import { anomaly, casualtiesSummary, incidentConcise, incidentDetails, incidentsList, incidentsNearCity, sitrep, worstIncidents } from "./intents/incidents";
import { crossAnalysis, globalOverview, help, orsecSummary } from "./intents/overview";
import { criticalConcentration, riskPredictionAnswer, riskZoneAnswer, riskiestZone, touchedZones } from "./intents/risk";
import { seismicStatus } from "./intents/seismic";
import { mobilizablePotential, unitsStatus } from "./intents/units";
import { norm } from "./labels";
import { activityPeaks, last24hSummary, todayIncidents, todayVsYesterday, trendIncidents, trends, unusualEvolution } from "./temporal";
import type { AiAnswer, AiContext } from "./types";

/** Traduit une requête NL → requête Couche 1 déterministe + réponse par gabarit. */
export function interpret(q: string, ctx: AiContext): AiAnswer {
  const nq = norm(q);
  // Court-circuit si rien
  if (!q.trim()) return help(q, ctx);

  // salutation opérateur + "tu es qui ?" / "qui es-tu ?" / "présente toi" / "qui est tu" / "qui tu es"
  // ⚠️ DOIT ÊTRE AVANT les regex générales sinon fallback vers incident.
  // 🔥 Ajout : questions IDENTITÉ / PROVENANCE / CRÉATEUR ("qui t'a développé ?" "c'est quoi ARGOS ?" etc.)
  const identiteCue = /\b(qui\s+(t['’]a|te\s+)?(developp|d[eé]velopp|fais|fabriqu|cr[eé]|construi)|qui\s+est\s+ton\s+(cr[eé]ateur|developpeur|d[eé]veloppeur|auteur|p[èe]re|constructeur)|tu\s+viens\s+d['']o[uù]|quelle\s+est\s+ton\s+(origine|provenance)|c['']est\s+quoi\s+(argos|copilot|ce\s+logiciel|cette\s+plateforme|l['']assistant)|qu['']est\s+ce\s+qu[''](argos|il)|qui\s+a\s+fait\s+(argos|le\s+copilot)|tu\s+(es|est)\s+(fait|cr[eé]|developp|d[eé]velopp)|a\s+qui\s+appartiens[st]?|de\s+qui\s+viens[st]?|tu\s+sers\s+a\s+quoi|tu\s+fais\s+quoi\s+ici)\b/i;
  if (
    /^(bonjour|bonsoir|salut|hey|hello|coucou|bjr|cc|bon apres|bonne apres midi|good morning|good evening)\b|^bonjour[ !,]*$|^bonsoir[ !,]*$|^salut[ !,]*$/.test(nq) ||
    /\b(tu es qui|tu est qui|qui es tu|qui est tu|qui es-tu|qui est-tu|qui tu es|qui t'es|qui etes vous|qui êtes vous|qui est ce que tu es|c'est quoi ton nom|ton nom est quoi|tu t'appelles comment|ton prenom|ton prénom|tu es quoi|tu fais quoi|presente toi|présente toi|présentation|c'est qui|qui est toi|qui suis-je|qui suis je|qui est ce|présente|présente|presente)\b/i.test(nq) ||
    identiteCue.test(nq) ||
    (nq.length <= 120 && /tu es|tu est|qui\s+(est|es|sont|éta|êtes)\b|t['eê]s\s+qui|t['eê]s\s+quoi/i.test(nq) && /copilot|assistant|ia\b|ai\b|bot|robot|argos/.test(nq))
  ) {
    const h = new Date().getHours();
    // Si c'est une question IDENTITE (pas juste un bonjour), on précise 1 phrase + chips
    const justGreeting = /^(bonjour|bonsoir|salut|hey|hello|coucou|bjr|cc|bon apres|bonne apres midi|good morning|good evening)/.test(nq) || /^bonjour[ !,]*$|^bonsoir[ !,]*$|^salut[ !,]*$/.test(nq);
    const acc =
      identiteCue.test(nq)
        ? "Je suis le Copilot ARGOS, assistant opérationnel de la plateforme de gestion des incidents FAR/RM/ORSEC. Je synthétise les données de la plateforme en langage naturel. Que souhaites-tu consulter ?"
        : h < 12
          ? "Bonjour opérateur, comment puis-je t'aider ?"
          : h < 18
            ? "Bon après-midi opérateur, comment puis-je t'aider ?"
            : "Bonsoir opérateur, comment puis-je t'aider ?";
    const suggestionsIdentite = !justGreeting && identiteCue.test(nq)
      ? [
          { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
          { label: "Incident le plus grave", query: "incident le plus grave" },
          { label: "SITREP", query: "SITREP incidents en cours" },
        ]
      : [
          { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
          { label: "Situation hôpitaux", query: "situation des hôpitaux" },
          { label: "Détail INC-2607", query: "Détail INC-2607" },
          { label: "Analyse croisée INC-2607", query: "Analyse croisée INC-2607" },
          { label: "SITREP", query: "SITREP incidents en cours" },
        ];
    return {
      intent: "greeting",
      layer1: identiteCue.test(nq) ? "identité & provenance Copilot ARGOS" : "salutation opérateur",
      text: acc,
      suggestions: suggestionsIdentite,
    };
  }

  // phrases SOCIALES / POLITES (pas métier) : réponse COURTE + chips, AUCUNE donnée, AUCUN tableau.
  // Inclut les variantes sans espace : "cava"  "cava?"  "okmerci" (traitement compact)
  const socialThanks = /\b(merci|merci bien|merci beaucoup|thanks|thx|danke|gracias|tres bien|très bien|tres sympa|très sympa|tres cool|top|super|parfait|impecc|genial|génial|awesome|nice)\b/;
  const socialAck = /\b(d'accord|daccord|ok|okay|okey|oui|non|entendu|bien recu|bien reçu|recu|reçu|c'est noté|c est noté|cest noté|tres bien|ok merci|je vois|compris|je comprends|parle|parle-moi|parle moi|parle moi en francais|parle moi en français|alors|vas-y|vas y|go|on y va|on y est)\b/;
  const socialBye = /\b(au revoir|a plus|a\+|bye|byebye|a bientot|à bientôt|bonne soirée|bonne soiree|bonne journee|bonne journée|à plus|ciao|adieu|a la prochaine|a plus tard)\b/;
  // compact match : "cava", "cava?", "ça va", "ça va ?", "ça-va" (on retire espaces tirets ponctuations puis match)
  const compactSocial = (s: string) => s.replace(/[\s\-_?!.,;:'"]+/g, "").toLowerCase();
  const compactNq = compactSocial(nq);
  const socialCompact = compactNq === "cava" || compactNq === "çava" || compactNq === "sava" || compactNq === "okmerci" || compactNq === "ouiok";
  const socialHowRU = /(ça va|ca va|cava|tu vas bien|tu vas bien\s*\?|comment vas tu|comment vas-tu|comment ca va|comment ça va|comment cava|comment tu vas|tu vas|ca se passe|comment ca se passe|comment ça se passe|comment\s+ça\s+va|ca va\s*\?|ça va\s*\?|cava\s*\?)/i;
  if (
    socialThanks.test(nq) || socialAck.test(nq) || socialBye.test(nq) || socialHowRU.test(nq) || socialCompact
  ) {
    let rep = "";
    if (socialBye.test(nq)) rep = "À bientôt opérateur, reste prudent.";
    else if (socialThanks.test(nq) || /merci/.test(compactNq)) rep = "Avec plaisir. Sur quoi puis-je t'aider ?";
    else if (socialHowRU.test(nq) || /cava|çava|sava|ça\s*va|ca\s*va/i.test(compactNq)) rep = "Tout fonctionne opérateur, prêt. Et toi ? Sur quelle situation veux-tu des informations ?";
    else if (socialAck.test(nq) || socialCompact) rep = "Bien noté. Quelle information souhaites-tu ?";
    else rep = "Bien sûr, je t'écoute.";
    return {
      intent: "social",
      layer1: socialHowRU.test(nq) || /cava/.test(compactNq) ? "réponse sociale : comment ça va" : socialBye.test(nq) ? "réponse sociale : au revoir" : "réponse sociale",
      text: rep,
      suggestions: [
        { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
        { label: "Situation hôpitaux", query: "situation des hôpitaux" },
        { label: "Incident le plus grave", query: "incident le plus grave" },
      ],
    };
  }
  if (nq.length <= 40 && /^(ca va|ça va|cava|ok|oui|non|bye|merci)$/i.test(nq.trim())) {
    return {
      intent: "social",
      layer1: "social court",
      text: "Bien sûr, sur quoi puis-je t'aider ?",
      suggestions: [{ label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const }],
    };
  }

  // aide
  if (/aide|help|comment|qu'est ce que tu peux|tu sais faire|que peux tu|que fais tu|comment ca marche/.test(nq)) return help(q, ctx);

  // Questions quantitatives (combien / nombre / total) — priorité haute
  // ⚠️ `\b` word boundary obligatoire : sinon on match "nombre" contient "on a" / "on" !
  // ⚠️ FIX 2026-08-11 : "nombre d'incidents" → apostrophe `d'` PAS matchée par d[eu].
  //    On utilise une regex PLUS SIMPLE : SI la phrase contient "combien|nombre|total|combien|on a"
  //    PUIS on match le lexique après (pas besoin de liaison exacte).
  // 🔥🔥 14/08/26 : AJOUT lexique "taux lits / lits disponibles / disponibilités lits" → direct hospitalsStatus
  const hasLitDispo = /(taux\s+de\s+)?(lits?|lit)\s*(disponibles?|disponibilit[ée]|libres?|occupe[és]|taux\s+d['’]?occupation?|taux\s+occupation)/i.test(nq);
  const hasQuant = /\b(combien|nombre|total|quel\s+nombre|on\s+a|dispose[\s-]+de|combien\s+y\s+a)\b/i.test(nq);
  if ((hasQuant && /(hopital|hospinet|sante|hopitaux|etablissement|rea|lits|chambre)/i.test(nq)) || hasLitDispo) return hospitalsStatus(q, ctx);
  if (hasQuant && /(unite|equipe|far|unites|bataillon|compagnie)/i.test(nq)) return unitsStatus(q, ctx);
  if (hasQuant && /(incident|evenement|alerte|operation|intervention|zone)/i.test(nq)) return incidentsList(q, ctx);
  // Si mot "combien" SEUL (sans lexique spécifique) → par défaut liste incidents (la question la plus fréquente)
  if (/\bcombien\b/i.test(nq) && !hasQuant /* guard si déjà traité au dessus */) return incidentsList(q, ctx);

  // 🔥 INTENTS TEMPORELS (priorité HAUTE avant global overview) §6.22
  // 👉 Aujourd'hui seulement
  if (/\b(aujourd['’]?hui|ce\s+jour|journ[ée]e\s+actuelle|ce\s+jour\s*m[êe]me)\b/i.test(nq) && /(incident|evenement|alerte|situatio|statist|nombre|total|declar|survenu|a\s+eu|eu\s+lieu|document|enregis)/i.test(nq)) return todayIncidents(q, ctx);
  if (/(incidents?\s+.*aujourd['’]?hui|aujourd['’]?hui.*incidents?)/i.test(nq)) return todayIncidents(q, ctx);
  // 👉 Dernières 24 heures / dernières 24h
  if (/(derni[èe]res?\s+(24|vingt[- ]?quatre)\s*(heures?|h)|24\s*h\s*(derni[èe]res?|glissant|precedentes?)|resume.*24\s*h|r[ée]sum[ée].*24\s*h|resume.*24\s*heure|r[ée]sum[ée].*24\s*heure)/i.test(nq)) return last24hSummary(q, ctx);
  if (/(resume|r[ée]sum[ée]|synth[èe]se|panorama|bilan).*(derni[èe]res?\s+24|24\s*h|24\s*heure)/i.test(nq)) return last24hSummary(q, ctx);
  if (/(resume|r[ée]sum[ée]).*(incidents?|evenements?|situations?).*(derni[èe]re|journ[ée]e).*(24|vingt)/i.test(nq)) return last24hSummary(q, ctx);
  // 👉 Aujourd'hui vs Hier (comparaison temporelle)
  if (/(compare|comparaison|rapport|diff[ée]rence|au\s+jourd['’]?hui\s+vs\s+hier|hier\s+vs\s+aujourd['’]?hui|aujourd['’]?hui\s+contre\s+hier|avant\s+hier|j\s+vs\s+j-1|j\s*\/\s*j-1)/i.test(nq)) return todayVsYesterday(q, ctx);
  if (/(au\s+jourd['’]?hui.*(compar|hier)|hier.*(compar|aujourd['’]?hui)|d[ée]j[àa]\s+hier|par\s+rapport\s+[àa]\s+hier)/i.test(nq)) return todayVsYesterday(q, ctx);
  // 👉 Tendance / évolution incidents (augmente/diminue)
  if (/(tendance|tendances|évolutions?|evolutions?|nombre\s+d['’]incidents?\s+(augmente|diminue|baisse|monte|augmentation|diminution)|est\s+ce\s+que\s+.*incidents?.*(augmente|diminue|baisse|mont[ée]))/i.test(nq)) return trendIncidents(q, ctx);
  if (/(incidents?.*(augmente|diminue|baisse|mont[ée]|hausse|chute))/i.test(nq)) return trendIncidents(q, ctx);
  // 👉 Pics d'activité
  if (/(pic|pics|pique|heures?\s+de\s+pointe|pics?\s+d['’]?activit[ée]s?|moments\s+chargés|périodes?\s+chargée|periode\s+charge)/i.test(nq)) return activityPeaks(q, ctx);
  // 👉 Évolutions inhabituelles / anomalies temporelles
  if (/(inhabituelle|inhabituels?|anomalie|anomalies?|d[ée]viation|[ée]cart\s+important|soulèvement|brutale|brusque|pic\s+anormal|situations?\s+inhabituelle|est\s+ce\s+qu['’]il\s+y\s+a.*anom)/i.test(nq)) return unusualEvolution(q, ctx);
  if (/(anomal|inhabituel|évolutions?\s+inhabitu|evolutions?\s+inhabitu|alarmant)/i.test(nq) && /(incident|evenement|activit|journ[ée]e|semaine)/i.test(nq)) return unusualEvolution(q, ctx);

  // 🔥 INTENTS GÉOGRAPHIQUES (avant global overview) §6.22
  // 👉 Zones les plus touchées
  if (/(zones?\s+(les\s+plus\s+|plus\s+|les\s+mieux\s+)?touchées?|touch[eé]es?\s+zones?|r[ée]gions?\s+(touchées?|impactées?|affectées?)|zones?\s+impactées?|zones?\s+affectées?|quelles\s+zones?\s+.*touch|quelles\s+r[ée]gions?\s+.*touch|zones?\s+d['’]?intérêt|hotspots?|points?\s+chauds)/i.test(nq)) return touchedZones(q, ctx);
  // 👉 Incidents PROCHES d'une ville (Casablanca / Rabat / ...)
  if (/(pr[eè]s\s+de|autour\s+de|aux\s+alentours?\s+d['’]e|aux\s+environs\s+d['’]e|proximit[ée]\s+d['’]e|(proche|voisine|avoisinante).*\s+de|(incidents?|evenements?|alertes?).*\s+(dans\s+la\s+r[ée]gion\s+de|à\s+c[ôo]té\s+de|(pr[eè]s|proche)\s+de))/i.test(nq) && /(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|ville)/i.test(nq)) return incidentsNearCity(q, ctx);
  if (/(incidents?\s+(à|a)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda)|(casa|casablanca|rabat|marrakech).*(incidents?|evenements?))/i.test(nq)) return incidentsNearCity(q, ctx);
  // 👉 Concentration incidents CRITIQUES
  if (/(concentration|regroupement|amas|grappe|foyers?)\s+.*(critique|grave|important|critiques?|sév[èe]res?|élevés?|severes?)|o[uù]\s+(se\s+)?(concentre|regroupe)\s+(les\s+)?incidents?\s+(critiques?|graves?|prioritaires?)/i.test(nq)) return criticalConcentration(q, ctx);
  if (/(incidents?\s+critiques?|incidents?\s+graves?).*(o[uù]|région|zone|concentration|où\s+se\s+trouve(nt)?)/i.test(nq)) return criticalConcentration(q, ctx);
  // 👉 Zone avec PLUS GRAND RISQUE
  if (/(zones?\s+(la\s+plus\s+|plus\s+|le\s+plus\s+grand)\s+(risquée?|dangereuse?|risqu[eé]e|critique)|quel(le)?\s+zone\s+(présente|a|offre)\s+(le\s+plus\s+)?(risque|niveau\s+de\s+risque|danger))/i.test(nq)) return riskiestZone(q, ctx);
  if (/(risque|niveau\s+de\s+risque).*(zones?|r[ée]gions?)|quel(le)?\s+(r[ée]gion|zone).*(risque|plus\s+dangereuse)/i.test(nq)) return riskiestZone(q, ctx);

  // 🔥 INTENTS MODULE IA PREDICTIONS RISQUES (avant global overview, 100% réel)
  //     → "risques à Rabat" / "risques Marrakech" / "risque sur Casablanca"
  const riskCueCity =
    /(risques?|estimation|pr[eé]diction|alerte\s+risque|d[eé]gradation|score\s+risque).*\s+(à|a|de|sur|pour|dans)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|t[aâ]louet|errachidia|ouarzazate)/i;
  const riskCityName =
    /^(risques?|estimation|pr[eé]diction)\s+(à|a|de|sur|pour)\s+(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|errachidia|ouarzazate)/i;
  const riskAnyCity = /(casa|casablanca|rabat|marrakech|f[eè]s|tanger|agadir|mekn[eè]s|oujda|t[ée]touan|safi|kenitra|taza|nador|settat|beni\s+mellal|errachidia|ouarzazate).*(risques?|pr[eé]dictions?\s+(de\s+)?risques?|estimation)/i;
  if (riskCueCity.test(nq) || riskCityName.test(nq) || riskAnyCity.test(nq)) return riskZoneAnswer(q, ctx);
  //     → "prédictions IA risques" / "estimation de risques" / "risques" (sans ville)
  const riskGlobal =
    /(pr[eé]dictions?\s+(de\s+)?risques?|risques?\s+(ia|ia\s*predict|estim[ée]s?|sur\s+24h|sur\s+48h|dans\s+les?\s+prochaines?\s+heure|horizon|24\s*h|48\s*h))/i;
  const riskGlobal2 =
    /^(risques?|estimation\s+de\s+risques?|foyers\s+(critiques?|de\s+risque)|score\s+risque\s+global|probabilit[eé]\s+d['eé]gradation)$/i;
  const riskGlobal3 =
    /(quel(le)?s?\s+sont\s+les?\s+pr[eé]dictions?|quelles?\s+risques?\s+.*prochaines?\s+heure|d[eé]gradation\s+probables?|o[uù]\s+risque\s+d[eé]gradation)/i;
  if (riskGlobal.test(nq) || riskGlobal2.test(nq) || riskGlobal3.test(nq)) return riskPredictionAnswer(q, ctx);
  //     → Si question contient "risque" + "prédire"/"anticiper"/"estimer"/"prévision"
  if (/(pr[eé]dire|anticiper|estimer|pr[eé]voir|pr[eé]vision|anticipation).*(risque|d[eé]gradation|saturation|d[eé]bordement)/i.test(nq)) return riskPredictionAnswer(q, ctx);
  // 👉 Intervention PRIORITAIRE = incidents critiques/worstIncidents top5 priorité
  if (/(intervention\s+prioritaires?|actions?\s+prioritaires?|cas\s+prioritaires?|prioriser|urgents?\s+(de|à)\s+traiter|affecter\s+en\s+priorit[ée]|d[ée]ploiement\s+prioritaires?|quels\s+incidents?.*priorit|incidents?.*prioritaires?\s+intervention)/i.test(nq)) return worstIncidents(q, ctx, 3);

  // situation globale / vue d'ensemble / synthèse
  if (/vue globale|vue d'ensemble|situation globale|apercu general|synthese generale|etat des lieux|tableau de bord|resume general|panorama/.test(nq)) return globalOverview(q, ctx);

  // 🔥 PRIORITÉ MAX : INCIDENT LE PLUS GRAVE / PIRES INCIDENTS
  //    → Par POIDS sévérité HIGH > MEDIUM > LOW (pas proximité texte).
  //    → 2 regex : une mot-clé "incident" explicit, une phrase courte (<=80) avec adjectif pire/grave pour les questions contextuelles.
  const worstAdj = /(pire[s]?|le\s+plus\s+grave|plus\s+graves|critique[s]?|le\s+plus\s+dangereux|dangereux|le\s+plus\s+s[eé]v[èe]re|s[eé]v[èe]re\s+maximum|haut\s+niveau|niveau\s+max)/i;
  const incidentWord = /(incident|evenement|alerte|situation|cas)/i;
  if (worstAdj.test(nq) && incidentWord.test(nq)) {
    const topN: 1 | 3 = /(trois|3\s*incidents|top\s*3|les\s+plus\s+graves|pire[s]\s+incidents|3\s*premiers)/i.test(nq) ? 3 : 1;
    return worstIncidents(q, ctx, topN);
  }
  if (worstAdj.test(nq) && nq.length <= 100) {
    return worstIncidents(q, ctx, 1);
  }

  // SITREP / rapport de situation
  if (/sitrep|rapport de situation|compte[- ]rendu|brouillon/.test(nq)) return sitrep(q, ctx);

  // tendances
  if (/tendance|evolution|statistique|analyse.*incident|courbe|historique|evolution 30|trend/.test(nq)) return trends(q, ctx);

  // ORSEC
  if (/orsec|niveau orsec|plan orsec|organigramme|permanence|decision.*recent/.test(nq)) return orsecSummary(q, ctx);

  // bilan humain / casualties
  if (/bilan humain|victime|deces|blesse|disparu|mort|casualtie|rescousse|sauve/.test(nq)) return casualtiesSummary(q, ctx);

  // sismologie / séismes
  if (/seisme|sismique|seismologie|tremblement de terre|magnitude|quake|seismic|epicentre|profondeur/.test(nq)) return seismicStatus(q, ctx);

  // anomalies / retards
  if (/anomal|retard|ecart|deviation|alerte.*mouvement|mouvement.*retard|convoi.*retard/.test(nq)) return anomaly(q, ctx);

  // hôpitaux statut global
  if (/(etat|statut|saturation|occupation|capacite|disponibilite|liste|situation|bilan|vue|apercu|aperçu|panorama|inventaire).*(hopital|hospinet|sante|hopitaux|etablissement|rea|lits|chambre|liberte)/.test(nq) || /hospinet|reseau hospitalier|etat des hopitaux|situation des hopitaux|vue hopital|capacite hospitaliere|etablissements de sante|etablissements de santé/.test(nq)) return hospitalsStatus(q, ctx);

  // hôpitaux + proximité
  if (/(hopital|hospinet|sante|medecin|chu|hopitaux).*(proche|voisin|autour|distance|autour|rayon)/.test(nq) || /(proche|voisin|autour|distance).*(hopital|hospinet|sante|chu)/.test(nq)) return hospitalsNearest(q, ctx);
  const hasIncCue = resolveTarget(q, ctx.incidents);
  if (/hopital|hospinet|sante|etablissement sante/.test(nq) && hasIncCue) return hospitalsNearest(q, ctx);

  // unités posture globale
  if (/(posture|etat|statut|capacite|liste|disponibilite|readiness|preparation|situation|bilan|vue|apercu|panorama).*(unite|equipe|unite far|unites|far)/.test(nq) || /posture des unites|etat des unites|unites disponibles|toutes les unites|capacites des unites|situation des unites|bilan des unites/.test(nq)) return unitsStatus(q, ctx);

  // 🔥 NOUVEAU : POTENTIEL MOBILISABLE (région / ville / rayon km / périmètre)
  //    → "potentiel mobilisable 60 km autour de Casablanca"
  //    → "unités mobilisables dans la région Rabat"
  //    → "capacité mobilisable Marrakech"
  //    → "disponibilités 100 km de Fès"
  const mobRayonExplicit = /(\d+\s*(?:km|kilom[èe]tres?)|rayon|p[ée]rim[èe]tre|autour\s+de|dans\s+(?:un\s+)?rayon)/i;
  const mobCueWords = /(potentiel\s+mobilisab|mobilisab|capacit[eé]\s+mob|capacit[ée]\s+de\s+mobi|disponibilit[eé]\s+unite|(unite|unit[ée]s).*(zone|region|perimetre|périmètre|rayon|ville))/i;
  const mobCity = /(casa|casablanca|rabat|marrakech|f[eè]s|fes|tanger|agadir|mekn[eè]s|meknes|oujda|t[ée]touan|tetouan|safi|kenitra|taza|nador|settat|beni\s+mellal|errachidia|ouarzazate|temara|mohammedia|bouskoura|hoceima|al\s+hoceima|taroudant|tiznit|guercif|berkane|sal[ée]|skhirate)/i;
  const mobRegion = /(region\s+(de|du)?|r[ée]gion\s+(de|du)?|rabat[\s-]+sal[eé]|casablanca[\s-]+settat|marrakech[\s-]+safi|f[eè]s[\s-]+mekn[eè]s|tanger[\s-]+t[eé]touan|souss[\s-]+massa|l'oriental|oriental)/i;
  if ((mobRayonExplicit.test(nq) || mobCueWords.test(nq) || mobRegion.test(nq) || (mobCity.test(nq) && /(mobilisab|disponibilit[eé]|potentiel|capacit[eé]\s+mob|pretes|pret\s+a|envois?|renfort)/i.test(nq))) && !/saturation|occupation|etat\s+(des\s+)?(hopital|hospinet|hospi)/i.test(nq)) return mobilizablePotential(q, ctx);

  // 🔥 PRIORITAIRE : ÉTAT GLOBAL STOCKS / RUPTURES / HORS SERVICE
  //    → Déclenche SUR LA REQUÊTE EXACTE utilisateur "état des stocks des équipements critiques
  //      (ruptures / HORS SERVICE)". Ne PAS passer en equipmentSearch (qui est une recherche
  //      par mot-clé et retournait 0 résultats sur la requête générique).
  if (
    /(etat|statut|situation|bilan|vue|apercu).*(stock|rupture|rupture.*stock|inventaire|equipement|materiel).*(critique|urgent|sensible|rupture|hors service|hs|sous seuil|disponibilite)/.test(nq) ||
    /stock.*(critique|rupture|hors service|hs|sous seuil|alerte|disponibilite|etat|statut)/.test(nq) ||
    /rupture.*(stock|equipement|materiel|critique|alerte)/.test(nq) ||
    /(hors service|\bh\s*s\b).*(equipement|stock|materiel)/.test(nq) ||
    /equipements?\s+critiques?\s+\(?\s*ruptures?\s*\/?\s*hors\s+service/.test(nq)
  ) return equipmentCriticalStatus(q, ctx);

  // équipements / inventaire / recherche par mot-clé (reste générique pour "cherche X", "citerne", etc.)
  if (/equipement|inventaire|stock|cherche|recherche|trouve|materiel|catalogue.*equip|piece|kit|groupe electrogene|tente|brancard/.test(nq)) return equipmentSearch(q, ctx);

  // 🔥 PRIORITAIRE : ÉQUIPEMENTS POUR UN INCIDENT / DISPOSITIF INCIDENT
  //    → Cas complexe #1 : "équipements disponibles pour INC-2607"
  //    → Cas complexe #3 : "dispositif pour INC-2607 / moyens recommandés / moyens à engager / plan de déploiement"
  //    - Si un INC est ciblé → crossAnalysis (fournit équipements liés unités recommandées + hôpitaux proches + 360°).
  if (
    (hasIncCue && /(equipements?|inventaire|stocks?|ruptures?|materiels?)\s+(disponibles?|pour|d[eé]di[eé]s?|associ[eé]s?|li[eé]s?|rattach[eé]s?|affect[eé]s?|pr[eé]vus?|requis|demandes?|nécessaires?)/i.test(nq)) ||
    (hasIncCue && /(dispositif|plan\s+de\s+d[ée]ploiement|moyens\s+(recommand[ée]s?|[àa]\s+mettre\s+en\s+place|[àa]\s+engager|[àa]\s+d[ée]ployer|ordonnanc[ée]s?|pr[éè]vus?|disponibles?))/i.test(nq)) ||
    /(dispositif|moyens\s+(recommand[ée]s|[àa]\s+engager|[àa]\s+mettre\s+en\s+place|[àa]\s+d[ée]ployer)).*\b(INC-\d{3,6})\b/i.test(q) ||
    /\b(INC-\d{3,6})\b.*(dispositif|moyens\s+(recommand[ée]s|[àa]\s+engager|[àa]\s+mettre\s+en\s+place|[àa]\s+d[ée]ployer))/i.test(q)
  ) return crossAnalysis(q, ctx);

  // analyse croisée / croisement / fiche complète / 360
  if (/analyse croise|croisement|fiche complete|360|vue complete|consolid|synthese.*incident/.test(nq) || (/croise|complet|global|detailled|detail complet|toutes les informations/.test(nq) && hasIncCue)) {
    return crossAnalysis(q, ctx);
  }

  // 🔥 ROUTEUR UNIVERSEL (fin de liste) :
  //    Si on est arrivé ici (aucune regex précise n'a matché) MAIS la requête contient
  //    un lexique DOMAINE EXPLICITE (hopital / unité / incident) → on route DIRECTEMENT
  //    vers la fonction STATUT correspondante (plutôt que le fallback "je n'ai pas compris").
  //    — Permet de matcher "sur les hopitaux", "les hopitaux", "unité FAR", "tous les incidents", etc.
  //    — On laisse passer SI et seulement SI le mot lexique apparaîssent (pas de faux positif).
  const universalHopital = /(hopital|hospinet|sante|santé|hopitaux|etablissement|etablissements|hopitaux|rea|lits|hospi)/i.test(nq);
  const universalUnite   = /(unite|equipe|unité|unités|équipe|far|bataillon|compagnie|unites)/i.test(nq);
  const universalIncident = /(incident|incidents|evenement|alerte|operation|intervention)/i.test(nq);
  if (universalHopital) return hospitalsStatus(q, ctx);
  if (universalUnite && !universalIncident) return unitsStatus(q, ctx); // évitons "unite d'incident"
  if (universalIncident) return incidentsList(q, ctx);

  // Attributs d'incident (pré-déclarés car utilisés dans l'if juste après)
  const incidentAttrCue = /(statut|status|s[eé]v[ée]rit[ée]|gravit[ée]|niveau|localis|position|coordon|lieu|ville|r[eé]gion|description|d[eé]tail|informations?|t[iy]tre|nom|type|cat[eé]gorie|commentaire|note|historique|d[eé]clench[ée]|d[eé]but|date|horaire|creation|cr[ée]|maj)/i;
  const pronounsCue = /(quel\s+est|quelle\s+est|quels\s+sont|quelles\s+sont|c['e]st\s+quoi|ou\s+est|o[uù]\s+se\s+trouve|donne[\s-]moi|montre|affiche|liste|indique|peux[\s-]tu\s+me\s+dire|dis[\s-]moi|r[eé]sum[eé]|synth[ée]se)/i;
  const possessiveCue = /(son\s+statut|sa\s+(s[eé]v|s[eé]vé|grav)|sa\s+localis|ses\s+d[eé]tails|son\s+titre|son\s+type|sa\s+r[eé]gion|o[uù]\s+il\s+est|comment\s+il\s+(est|va)|est[- ]ce\s+qu['i]l\s+est)/i;

  // détail incident / attributs d'incident
  if (
    /detail|informations.*incident|fiche.*incident|qu'est ce que.*incident|en dire plus|en savoir plus/.test(nq) ||
    (hasIncCue && /incident|evenement|operation|alerte|zone|region/.test(nq) && !/unite|equipe|mobilis|dispatch/.test(nq)) ||
    (ctx.currentIncidentId && (incidentAttrCue.test(q) || pronounsCue.test(q) || possessiveCue.test(q))) ||
    (hasIncCue && (incidentAttrCue.test(q) || possessiveCue.test(q)))
  ) {
    const sub = classifyIncSubIntent(q);
    return incidentConcise(q, ctx, sub);
  }
  if (hasIncCue && (nq.length < 25 || /^inc[- ]?\d+$/i.test(q.trim()))) {
    const sub = classifyIncSubIntent(q);
    return incidentConcise(q, ctx, sub);
  }

  // liste incidents (par défaut si pas d'autre cue mais parle d'incidents)
  if (/liste.*incident|tous.*incident|combien.*incident|quel.*incident|incident.*ouverte|incident.*ferme|incident.*haut|incident.*critique|incident.*region|par region/.test(nq)) return incidentsList(q, ctx);

  // reachability (unités pour un lieu avec capacité/délai)
  if (/unite|equipe|atteindre|rejoindre|mobilis|envoyer|dispatch|proche|capable|peut|peuvent|assistance.*unite|soutien|renfort|helico|medevac|evasan/.test(nq)) return reachability(q, ctx);

  // Fallback 1 : si la question contient un incident mais n'est pas catégorisée
  if (hasIncCue) return incidentDetails(q, ctx);

  // Fallback 2 : on tente une recherche d'équipement (mot-clés)
  const words = q.trim().split(/\s+/).filter((w) => w.length >= 4);
  if (words.length && ctx.equipment.some((e) => words.some((w) => norm(e.desig).includes(norm(w)) || norm(e.cat).includes(norm(w))))) {
    return equipmentSearch(q, ctx);
  }

  // Fallback 3 (dernier) : intention non reconnue.
  // → TEXTE AFFICHÉ COURT (1 phrase + chips) MAIS ON PASSE L'ENSEMBLE DES DONNÉES (globalOverview struct) AU LLM POUR QU'IL PUISSE RÉPONDRE CONTEXTUALISÉ MÊME HORS RÉGEX.
  const overview = globalOverview(q, ctx);
  return {
    intent: "unknown",
    layer1: "interprétation non reconnue — contexte globalOverview transmis au LLM",
    text: "Je n'ai pas compris exactement ta requête. Reformule avec un mot-clé comme « incidents » / « hôpitaux » / « unités » / « situation globale » ou bien sélectionne une suggestion ci-dessous.",
    units: overview.units,
    incidents: overview.incidents,
    hospitals: overview.hospitals,
    quakes: overview.quakes,
    topEquip: overview.topEquip,
    stats: overview.stats,
    analytics: overview.analytics ?? ctx.analytics ?? null,
    cross: undefined,
    suggestions: [
      { label: "Situation globale", query: "Situation globale opérationnelle", priority: "primary" as const },
      { label: "Situation hôpitaux", query: "situation des hôpitaux" },
      { label: "Combien d'incidents", query: "combien d'incidents en cours" },
      { label: "Détail INC-2607", query: "Détail INC-2607" },
      { label: "Analyse croisée INC-2607", query: "Analyse croisée INC-2607" },
      { label: "SITREP", query: "SITREP incidents en cours" },
    ],
  };
}
