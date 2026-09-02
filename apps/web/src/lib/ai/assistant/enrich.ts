// ============================================================================
// ARGOS — assistant IA · Enrichissement de la question par l'historique et résolution des cibles nommées.
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { INCIDENT_PLACE, norm } from "./labels";
import type { EnrichedQuery, IncSubIntent, IntentTopicHint } from "./types";
import type { Incident } from "@/lib/types";

/**
 * Enrichit une requête potentiellement vague ("quel est sa sévérité ?", "au niveau international")
 * à partir des ~15 derniers messages. Retourne :
 *   - la requête enrichie (texte),
 *   - un incident cible (si détecté dans l'historique, ex INC-2595),
 *   - des unités / hôpitaux cibles optionnels.
 */
export function enrichFromHistory(query: string, history: { role: "user" | "assistant"; text: string; layer1?: string }[]): EnrichedQuery {
  const q = query.trim();
  const result: EnrichedQuery = { query: q };
  if (!q) return result;
  const nq = norm(q);

  // --- 1) INCIDENT CIBLE depuis l'historique : 3 stratégies ---
  // a) Chercher INC-\d+ DANS LA REQUÊTE ACTUELLE (priorité max)
  const mCurrent = q.match(/\b(INC-\d{3,6})\b/i);
  if (mCurrent) {
    result.targetIncidentId = mCurrent[1].toUpperCase();
  }
  // b) Sinon : le DERNIER INC-\d+ apparaissant dans les 15 derniers messages (user OU assistant)
  if (!result.targetIncidentId) {
    for (let i = history.length - 1; i >= Math.max(0, history.length - 15); i--) {
      const txt = history[i]?.text || "";
      const m = txt.match(/\b(INC-\d{3,6})\b/i);
      if (m) {
        result.targetIncidentId = m[1].toUpperCase();
        break;
      }
    }
  }
  // c) Sinon : regarder layer1 "detail INC-XXXX"
  if (!result.targetIncidentId) {
    for (let i = history.length - 1; i >= Math.max(0, history.length - 15); i--) {
      const l1 = history[i]?.layer1 || "";
      const m = l1.match(/\b(INC-\d{3,6})\b/i);
      if (m) {
        result.targetIncidentId = m[1].toUpperCase();
        break;
      }
    }
  }

  // --- 2) Unité / Hôpital cible depuis historique (si layer1 les mentionne explicitement) ---
  for (let i = history.length - 1; i >= Math.max(0, history.length - 8); i--) {
    const l1 = history[i]?.layer1 || "";
    if (!result.targetUnitId) {
      const um = l1.match(/unit[eé]\s*(\S+)/i);
      if (um) result.targetUnitId = um[1];
    }
    if (!result.targetHospitalId) {
      const hm = l1.match(/hosp\S*\s*(\S+)/i);
      if (hm) result.targetHospitalId = hm[1];
    }
    if (result.targetUnitId && result.targetHospitalId) break;
  }

  // --- 3) Requête courte / vague → préfixe avec le sujet du layer1 précédent ---
  if (q.length <= 140) {
    const hasEnoughContext =
      /(d[eéé]tail|fiche|description|informations?|statut|s[eé]v[ée]rit[ée]|gravit[ée]|localis|proche|analyse\s*crois[ée]e|croisement|cross|combien|quel\s+(est|sont|est\s*son|est\s*sa|sont\s*ses)|c['e]st\s*quoi|ou\s+est|son\s+statut|sa\s+(s[eé]v|s[eé]vé|grav)|sa\s+localis|ses\s+d[eéé]tails?|ses?\s+caract[eé]ristiques?|historique|d[eé]clench[eé]|comment\s+ca\s+va|et\s+pourquoi|au\s+niveau|ensuite|et\s+apres|et\s+après|donne\s+moi|affiche|montre)/.test(nq) ||
      (result.targetIncidentId ? nq.length <= 140 : nq.length <= 70);
    if (hasEnoughContext) {
      // Cherche le sujet du dernier assistant par layer1
      let topic: IntentTopicHint = "unknown";
      for (let i = history.length - 1; i >= Math.max(0, history.length - 8); i--) {
        const layer = (history[i]?.layer1 || "").toLowerCase();
        if (/seismic|sism|seisme|quake/.test(layer)) { topic = "seismic"; break; }
        else if (/hospitaux|hospinet|sante|etablissement/.test(layer)) { topic = "hospital"; break; }
        else if (/detail.*incident|liste.*incident|incident/.test(layer) || result.targetIncidentId) { topic = "incident"; break; }
        else if (/posture|unite.*far|unite|readiness/.test(layer)) { topic = "unit"; break; }
        else if (/cross|croise|croisement/.test(layer)) { topic = "cross"; break; }
        else if (/global|vue.*ensemble|panorama|apercu|synthese multi/.test(layer)) { topic = "global"; break; }
        else if (/orsec/.test(layer)) { topic = "orsec"; break; }
        else if (/equip|inventaire|materiel|cherche/.test(layer)) { topic = "equipment"; break; }
        else if (/mouvement|convoi|retard|anomal/.test(layer)) { topic = "logistics"; break; }
        else if (/tendanc|evolution 30|statist/.test(layer)) { topic = "trends"; break; }
        else if (/bilan humain|victime|deces|blesse|casualt/.test(layer)) { topic = "casualties"; break; }
      }
      // Si on a trouvé un incident cible OU que le sujet est incident → préfixe avec INC cible
      if (topic === "incident" && result.targetIncidentId) {
        // On ajoute systématiquement l'INC cible dans la query texte pour que regex detail/statut matche
        if (!/INC-\d+/i.test(q)) {
          result.query = `${result.targetIncidentId} — ${q}`;
          return result;
        }
      }
      if (topic === "unknown") return result;
      const prefix: Record<IntentTopicHint, string> = {
        seismic: "Concernant la sismologie : ",
        hospital: "Concernant les hôpitaux : ",
        incident: "Concernant les incidents : ",
        unit: "Concernant les unités FAR : ",
        cross: "Dans le cadre d'une analyse croisée : ",
        global: "Sur la situation globale : ",
        orsec: "Concernant le dispositif ORSEC : ",
        equipment: "Concernant les équipements / inventaire : ",
        logistics: "Concernant la logistique et les mouvements : ",
        trends: "Concernant les tendances / statistiques : ",
        casualties: "Concernant le bilan humain : ",
        unknown: "",
      };
      result.query = (prefix[topic] || "") + q;
    }
  }
  return result;
}


export function resolveTarget(q: string, incidents: Incident[]): Incident | null {
  const nq = norm(q);
  // 1) match direct sur ID incident (ex: INC-2607)
  const idMatch = q.toUpperCase().match(/INC-\d+/);
  if (idMatch) {
    const byId = incidents.find((i) => i.id === idMatch[0]);
    if (byId) return byId;
  }
  for (const inc of incidents) {
    const place = INCIDENT_PLACE[inc.id] ?? inc.region;
    if (nq.includes(norm(place))) return inc;
    if (nq.includes(norm(inc.region.split("-")[0]))) return inc;
    if (norm(inc.titre).includes(nq)) return inc;
  }
  return null;
}

/**
 * Détermine SOUS-INTENT d'une question d'incident : est-ce que l'utilisateur demande
 * spécifiquement UN ATTRIBUT (c'est grave ? → severity / son statut ? → status / où est-ce ? → location)
 * ou la fiche complète ?
 */
export function classifyIncSubIntent(q: string): IncSubIntent {
  const nq = norm(q);
  if (/(c['e]st\s+grave|est[- ]ce\s+grave|grave\s*\?|comment\s+il\s+est|t['e]n\s+penses\s+quoi|qu['e]n\s+penses[- ]tu|avis|appr[eé]ciation|analys|risque|dangere|niveau)/.test(nq)) return "opinion";
  if (/(s[eé]v[eé]rit[eé]|gravit[eé]|s[eé]v[èe]re|quel\s+niveau|niveau\s+de).*\?*$/.test(nq)) return "severity";
  if (/(statut|status|stade|en\s+cours|ouverte|ferm[eé]e|comment\s+ça\s+avance|o[uù]\s+en\s+est|avancement|d[eé]roulement).*\?*$/.test(nq)) return "status";
  if (/(localis|position|o[uù]\s+est|o[uù]\s+se\s+trouve|lieu|ville|adresse|coordonn[eé]es|g[eé]olocalis|r[eé]gion|province|zone).*\?*$/.test(nq)) return "location";
  if (/(victime|bilan\s+humain|d[eé]c[eé]s|mort[s]?|bless[eé]s?|disparus?|secourus?|casualt).*\?*$/.test(nq)) return "casualties";
  return "full";
}
