/* ============================================================================
   llmIncidentDraft.ts — Génération Titre+Description via LLM local Ollama
   Fournit :
     1. generateIncidentDraft() : keywords → { title, desc } via Ollama
     2. paraphraseIncidentDraft() / paraphraseField() : paraphrase strict
     3. fallback déterministe si Ollama injoignable (re-sur pickTitle/pickDesc)
   ============================================================================ */

import {
  pickTitle,
  pickDesc,
  type DescriptionProposalInput,
  extractToponymsFromTokens,
} from "@/lib/ai/draft";
import {
  AI_DEFAULT_PROVIDER,
  AI_PROVIDERS,
  AI_TIMEOUT_MS,
  type LlmProviderConfig,
} from "@/lib/ai/config";

/* -------------------- Types -------------------- */
export interface IncidentDraftResult {
  title: string;
  desc: string;
  /** true = réponse est passée par le fallback (LLM indisponible) */
  fallback: boolean;
  /** Raison éventuelle de l'échec LLM (pour debug logs) */
  llmError?: string;
}

type ParaphraseField = "title" | "desc";

/* -------------------- Prompt système strict anti-invention -------------------- */

const SYSTEM_DRAFT = [
  "Tu es l'assistant de rédaction de signalements d'incident d'IRIS, la plateforme militaire de gestion des catastrophes.",
  "Ton unique tâche : produire un TITRE court et professionnel, puis une DESCRIPTION factuelle à partir des mots-clés fournis par l'opérateur.",
  "",
  "RÈGLES IMPÉRATIVES (tu les respectes SANS EXCEPTION) :",
  "[R0] TOPONYMES OBLIGATOIRES — TOUT lieu (ville, province, région, pays, quartier, adresse, lieu-dit, site, zone géographique) ÉCRIT explicitement dans les MOTS-CLÉS fournis OU dans la section LOCALISATION ci-dessous DOIT impérativement :",
  "     1) apparaître DANS LE TITRE (champ `title`),",
  "     2) apparaître AU MOINS UNE FOIS DANS LA DESCRIPTION (champ `desc`).",
  "     Tu n'ignores JAMAIS un lieu, tu ne l'omettras JAMAIS, tu ne le transformes JAMAIS en synonyme. Tu reprends le terme EXACT tel qu'il est fourni.",
  "[R1] TU N'INVITES RIEN. Aucun lieu, date, chiffre, nombre de victimes, nom de personne, nom de rue, code postal, coordonnées, température, magnitude, surface, durée ne peuvent apparaître s'ils ne sont PAS ÉCRITS explicitement dans les mots-clés fournis.",
  "[R2] AUCUNE action opérationnelle. Tu ne mentionnes JAMAIS : reconnaissance terrain, périmètre de sécurité, évacuation préventive, renforts, déploiement d'équipes, plan de distribution, camion-citerne, distribution d'eau, coordination, commandement, prise en charge, ouverture de lieux, sensibilisation, espaces rafraîchis, visite de personnes, sécurisation, montée en puissance, ni aucune mesure, recommandation, moyen engagé, action opérationnelle, consigne, procédure ou consigne de sécurité — SAUF si un de ces termes est PRÉSENT littéralement dans les mots-clés fournis.",
  "[R3] Tu ne transformes JAMAIS une information potentielle ou un risque en événement confirmé. Si les mots-clés mentionnent un « risque » → reste sur le terme « risque » ; ne dis pas « effondrement » si on a écrit « risque d'effondrement ».",
  "[R4] Tu ne fais PAS de liste. Tu ne recopies PAS les mots-clés à la suite, séparés par des tirets ou des virgules. Tu reformules UNIQUEMENT en phrases naturelles et cohérentes.",
  "[R5] La DESCRIPTION est une SYNTHÈSE FACTUELLE : 2 à 3 phrases courtes, uniquement sur la base des mots-clés + type d'incident déduit. Elle ne doit JAMAIS être un plan d'action, une procédure, ni une recommandation.",
  "[R6] Tu peux DÉDUIRE le type d'incident global à partir des mots-clés (ex : « manque d'eau, sols secs, stress hydrique » → type « sécheresse »). Cette déduction est autorisée et recommandée ; elle n'est PAS considérée comme une invention, à condition de ne pas ajouter de détails chiffrés ou de lieu.",
  "[R7] Si un mot-clé est ambigu ou incomplet, tu l'interprètes au sens strict, sans extrapoler. Si l'information n'est pas là → tu ne la mentionnes PAS.",
  "",
  "FORMAT DE SORTIE OBLIGATOIRE (strictement identique à chaque réponse, rien d'autre, pas de préambule, pas de commentaire, pas de Markdown) :",
  "  ```json",
  "  { \"title\": \"…\", \"desc\": \"…\" }",
  "  ```",
  "",
  "Exemple :",
  "  Input : type=sécheresse ; mots-clés = [\"Manques d'eau\", \"Sols secs\", \"Stress hydrique\"]",
  "  Sortie attendue :",
  "  ```json",
  "  { \"title\": \"Sécheresse — Manque d'eau signalé\", \"desc\": \"Un contexte de sécheresse est signalé. Un stress hydrique est constaté dans le contexte ; des sols secs sont observés ; un manque d'eau est signalé.\" }",
  "  ```",
  "",
  "Important : réponds UNIQUEMENT par le bloc ```json…``` précédé et suivi d'une ligne vide si besoin. Rien d'autre, merci.",
].join("\n");

const SYSTEM_PARAPHRASE = [
  "Tu es l'assistant de reformulation de signalements d'incident d'IRIS.",
  "Ta seule et unique tâche : PARAPHRASER le titre et/ou la description qui te sont fournis.",
  "",
  "RÈGLES IMPÉRATIVES :",
  "[P1] MÊME CONTENU FACTUEL EXACT. Tu n'ajoutes AUCUNE information, AUCUN détail, AUCUN chiffre, AUCUN lieu, AUCUNE action, AUCUNE recommandation, AUCUN élément qui n'est pas PRÉSENT dans le texte original.",
  "[P2] AUCUNE SUPPRESSION. Tu ne retires AUCUNE information qui apparaît dans le texte original (mots-clés, type d'incident, observations).",
  "[P3] MÊME SENS, MÊME NIVEAU D'INCERTITUDE. Si le texte original dit « risque », tu gardes un terme de même niveau (ex : « risque », « possibilité de ») ; tu ne transformes JAMAIS en événement confirmé.",
  "[P4] FORMULATION 100% DIFFÉRENTE. Tu utilises des synonymes, une autre structure de phrase, un autre ordre. Évite au maximum de reprendre les mêmes groupes de 3+ mots identiques.",
  "[P5] STYLE : professionnel, concis, phrases naturelles. Toujours en français.",
  "",
  "FORMAT DE SORTIE OBLIGATOIRE :",
  "  ```json",
  "  { \"title\": \"…\", \"desc\": \"…\" }",
  "  ```",
  "",
  "Si un seul champ doit être paraphrasé, tu renvois quand même les DEUX champs (l'autre inchangé). Rien d'autre dans la réponse, ni préambule ni commentaire.",
].join("\n");

/* -------------------- Utilitaires -------------------- */

function defaultCfg(): LlmProviderConfig {
  return { ...AI_PROVIDERS[AI_DEFAULT_PROVIDER] };
}

/** Nettoie la réponse brute LLM → extrait le bloc JSON valide. */
function extractJsonBlock(raw: string): any | null {
  if (!raw) return null;
  // Cas 1 : bloc ```json … ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  let candidate: string | undefined = fence?.[1];
  if (!candidate) {
    // Cas 2 : texte libre contenant { ... }
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      candidate = raw.slice(first, last + 1);
    }
  }
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Tentative de réparation : quotes échappées, backticks...
    try {
      const repaired = candidate
        .replace(/”|“|„|‚/g, '"')
        .replace(/\s*,\s*([}\]])/g, "$1")
        .replace(/(['"])?([a-zA-ZÀ-ÿ_][\wÀ-ÿ_-]*)\1\s*:/g, '"$2":')
        .replace(/: "?, "/g, '", "');
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
  return null;
}

/** Nettoie un texte de TOUT chiffre précis non explicitement présent dans keywords.
 *  (ex: "3 victimes", "magnitude 6.2", "15 km", "200 personnes") → strip sauf si
 *  le nombre ou l'unité apparaît littéralement dans les mots-clés saisis.
 */
function stripUnauthorizedNumbers(text: string, keywords: string[]): string {
  if (!text) return text;
  const kwFlat = keywords.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const kwHasUnit = (unit: string): boolean => kwFlat.includes(unit);
  return text
    .replace(/[0-9]+(?:[.,][0-9]+)?(?:\s*%|\s*‰|\s*°[CFK]?|\s*[$€£])/g, (match) => {
      const norm = match.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return kwFlat.includes(norm.replace(/\s+/g, "")) ? match : "éléments";
    })
    .replace(/[0-9]+(?:[.,][0-9]+)?\s*(?:km|km2|km\/h|m|cm|mm|ha|hectare|l|kg|t|tonne|kWh|kwh|j|heure|heures|min|minute|minutes|s|secondes?|jours?|personnes?|victimes?|vehicules?|vehic|bâtiments?|batiments?|hect|pers)/gi, (match) => {
      const norm = match.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
      const unit = match.toLowerCase().match(/[a-zéèêàâîôùûç]+/i)?.[0] ?? "";
      if (kwFlat.includes(norm)) return match;
      if (unit && kwHasUnit(unit)) return match.replace(/[0-9.,]+\s*/g, "plusieurs ");
      return "éléments";
    })
    .replace(/(?<!\w)[0-9]+(?:[.,][0-9]+)?(?!\w)/g, (match) => {
      const norm = match.replace(/\s+/g, "");
      return kwFlat.includes(norm) ? match : "plusieurs";
    })
    .replace(/\séléments\séléments/g, " éléments")
    .replace(/\s+/g, " ")
    .trim();
}

/** Validation post-LLM : blanchit toute invention éventuelle avant affichage.
 *  Vérifie la présence des motifs interdits NON PRÉSENTS dans les mots-clés.
 *  RÈGLES ADDITIONNELLES (durcis anti-invention) :
 *    [S1] Liste blanche lexicale étendue : couverture < 65 % → fallback global
 *    [S2] Chiffres précis hors keywords → strippés ou remplacés par "plusieurs / éléments"
 *    [S3] Interdits étendus : 38 motifs (contre 19 initialement) dont formulations
 *         détournées type "renforts sont envoyés", "mise en sécurité immédiate", etc.
 */
function sanitizeDraft(
  parsed: any,
  keywords: string[],
  fallbackTitle: string,
  fallbackDesc: string,
  opts?: { lexiconWhiteList?: Set<string> },
): { title: string; desc: string; triggered: boolean } {
  const titleRaw = typeof parsed?.title === "string" ? parsed.title.trim() : "";
  const descRaw = typeof parsed?.desc === "string" ? parsed.desc.trim() : "";
  if (!titleRaw || !descRaw) return { title: fallbackTitle, desc: fallbackDesc, triggered: true };
  let title = stripUnauthorizedNumbers(titleRaw, keywords);
  let desc = stripUnauthorizedNumbers(descRaw, keywords);

  const kwNorm = keywords.map((k) => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const kwSet = new Set(kwNorm);
  const kwHit = (pattern: RegExp) => kwNorm.some((k) => pattern.test(k));
  const textHit = (t: string, pattern: RegExp) => pattern.test(t);

  const forbiddenRegexes: RegExp[] = [
    /reconnaissance\s+(terrain|rapide|opera(tionnelle)?|des\s+(zones|lieux|b[iî]timents|infrastructures))/i,
    /camion[\s-]?citerne/i,
    /distribution\s+(d['']?eau|alimentaire|humanitaire)/i,
    /p[eé]rim[eè]tre\s+de\s+s[eé]curit[eé]/i,
    /coordination\s+(des|avec|du|entre|inter?|op[eé]rationnelle)/i,
    /mont[eé]e\s+en\s+puissance/i,
    /eéquipes?\s+(d[eé]ploy[eé]s?|mobilis[eé]s?|engag[eé]s?|envoy[eé]s?|pr[eé]positionn[eé]s?|de\s+secours|d['']intervention|sp[eé]cialis[eé]s?)/i,
    /d[eé]ploiement/i,
    /plan\s+d[''](eau|action|urgence|secours|contingence|eévacuation|distribution|urgence|continuit[eé])/i,
    /espaces?\s+rafra[iî]chis/i,
    /visites?\s+(aux?\s+personnes|personnes\s+[aâ]g[eé]es|à\s+domicile|à\s+proximit[eé])/i,
    /sensibilisation/i,
    /(renforts?|renforcement\s+(des|d['']|op[eé]rationnel))/i,
    /commandement|poste\s+de\s+commandement|PC\s+op[eé]rations?|centre\s+de\s+crise|cellule\s+de\s+crise/i,
    /prise\s+en\s+charge/i,
    /eévacuation\s+(pr[eé]ventive|obligatoire|imm[eé]diate|des\s+zones|des\s+personnes|des\s+riverains|pr[eé]ventive\s+des\s+b[eâ]timents)/i,
    /ouverture\s+(d['']?lieux|d['']espaces|d['']centres|d['']h[eé]bergements|d['']accueil|d['']abris|d['']espaces\s+rafra[iî]chis)/i,
    /s[eé]curisation\s+(des\s+zones|du\s+p[eé]rim[eè]tre|des\s+sites|imm[eé]diate|renforc[eé]e)/i,
    /d[eé]sengagement|evacuer?|mettre\s+en\s+s[eé]curit[eé]/i,
    /(mise|placement)\s+en\s+(s[eé]curit[eé]|quarantaine|confinement)/i,
    /(alimenter|fournir|distribuer)\s+(en\s+)?eau/i,
    /(appui|soutien)\s+(a[eé]rien|logistique|op[eé]rationnel|m[eé]dical)/i,
    /(d[eé]ploiement|envoi)\s+(des\s+moyens|de\s+renforts|d['']eéquipes)/i,
    /canal\s+de\s+crise|dispositif\s+(d['']urgence|de\s+secours|pr[eé]positionn[eé])/i,
    /fermeture\s+(pr[eé]ventive|des\s+routes|des\s+acc[eè]s|du\s+site)/i,
    /patrouilles?\s+(de\s+surveillance|anti[-\s]?rallumage|itineérantes?)/i,
    /message\s+(d['']alerte|à\s+la\s+population|aux\s+riverains)/i,
    /confinement\s+(pr[eé]ventif|des\s+riverains|de\s+la\s+zone)/i,
    /d[eé]contamination\s+(imm[eé]diate|des\s+personnes|de\s+la\s+zone)/i,
    /(campagne|appel)\s+(d['']information|d['']alerte|de\s+pr[eé]vention)/i,
    /information\s+(des\s+populations|aux\s+riverains|des\s+usagers)/i,
    /travaux\s+(de\s+d[eé]gagement|de\s+r[eé]tablissement|d['']urgence)/i,
    /(contrôles?|v[eé]rifications?)\s+sur\s+(le\s+terrain|les\s+ouvrages|les\s+r[eé]seaux)/i,
    /collaboration\s+avec\s+(les\s+services|les\s+autorités|l[eé]tat)/i,
    /suivi\s+(continuous?|en\s+temps\s+réel|m[eé]t[eé]orologique|horaire|des\s+r[eé]seaux)/i,
    /(pr[eé]paration|pr[eé]positionnement)\s+(de\s+lits|d['']h[eé]bergements|de\s+moyens|de\s+sables|d'endiguement)/i,
    /(transport|transfert|acheminement)\s+(m[eé]dicalisé?|des\s+victimes|de\s+moyens|de\s+mat[eé]riel)/i,
    /(expertise|v[eé]rification)\s+(technique|sp[eé]cialis[eé]e|radiologique|atmosph[eé]rique|infrastructure)/i,
  ];
  const hasForbidden = (t: string) =>
    forbiddenRegexes.some((r) => !kwHit(r) && textHit(t, r));

  let triggered = false;
  if (hasForbidden(title)) { title = fallbackTitle; triggered = true; }
  if (hasForbidden(desc)) { desc = fallbackDesc; triggered = true; }

  /* ====== S1 — COUVERTURE LEXICALE 65% (blanc étendu + lexicon) ======
     Fraction des mots (longueur ≥ 3 lettres) qui appartiennent à :
       A) les mots-clés saisis (forme normalisée)
       B) les toponymes confirmés (ici union keywords)
       C) un stop-list français autorisé + verbes d'état neutres
       D) le lexique sémantique s'il est fourni (appelant peut passer ALL_LEXICON_UNION)
     En dessous de 65% → le texte contient trop de vocabulaire non saisi = invention probable. */
  const STOP_WHITELIST = new Set([
    "le","la","les","un","une","des","du","de","au","aux","a","à","et","ou","mais","donc","or","ni","car","que","qui","quoi","dont","ou","où","ça","ca","ce","cette","ces","mon","ma","mes","ton","ta","tes","son","sa","ses","notre","votre","leur","leurs","je","tu","il","elle","on","nous","vous","ils","elles","pour","par","sur","sous","dans","vers","entre","en","avec","sans","selon","après","avant","pendant","afin","suite","partir","via","ainsi","aussi","comme","depuis","quand","lorsque","alors","bien","mal","tout","tous","toute","toutes","aucun","aucune","autre","autres","même","meme","chaque","quel","quelle","quels","quelles","déjà","deja","ici","là","oui","non","encore","toujours","jamais","souvent","parfois","rarement","rapidement","lentement","actuellement","préalablement","préalable","éventuellement","ultérieurement","prochainement","immédiatement","immédiat","étape","étapes","niveau","niveaux","point","points","cadre","cas","sens","évaluation","évaluations","vérification","vérifications","confirmation","confirmations","signalement","signalements","information","informations","donnée","données","contexte","élément","éléments","détail","détails","aspect","aspects","caractéristique","caractéristiques","mentionné","mentionnée","mentionnés","mentionnées","signalé","signalée","signalés","signalées","rapporté","rapportée","rapportés","rapportées","indiqué","indiquée","indiqués","indiquées","saisi","saisie","saisis","saisies","transmis","transmise","transmis","transmises","fourni","fournie","fournis","fournies","présent","présente","présents","présentes","disponible","disponibles","nécessaire","nécessaires","obligatoire","obligatoires","potentiel","potentielle","potentiels","potentielles","possible","possibles","probable","probables","susceptible","susceptibles","concerne","concernés","concernées","associé","associée","associés","associées","observé","observée","observés","observées","constaté","constatée","constatés","constatées","identifié","identifiée","identifiés","identifiées","détecté","détectée","détectés","détectées","repéré","repérée","repérés","repérées","mesure","mesures","prévoir","prévue","prévus","attendre","attendu","attendue","attendus","attendues","courant","courante","suivant","suivante","précédent","précédente","global","globale","local","locale","complet","complète","partiel","partielle","exact","exacte","précis","précise","fin","finale","final","initial","initiale","supplémentaire","complémentaire","complémentaires","hors","hors","zone","zones","lieu","lieux","site","sites","secteur","secteurs","région","régions","ville","villes","province","provinces","adresse","quartier","pays","type","nature","formulation","texte","valeur","champ","champs","terme","termes","exprimé","nécessite","requiert","reste","restent","reste","font","fait","sont","est","étaient","était","sera","seront","étant","avoir","être","faisant","fait","faisable","permettant","permet","permettra","possible","faisant","tenant","compte","respectivement","uniquement","seulement","notamment","explicitement","implicitement","directement","indirectement","ensuite","finalement","initialement","préalablement","durant","pendant","environ","approximativement","chacun","chacune","nombreux","nombreuses","divers","diverses","plusieurs","quelques","certains","certaines","trop","assez","peu","beaucoup","très","fort","faible","haut","élevé","bas","critique","important","importante","majeure","mineur","mineure","grave","léger","légère","modéré","modérée","élevé","élevée","nominale","nominal","acceptable","inacceptable","suffisant","suffisante","insuffisant","insuffisante","approprié","appropriée","adapté","adaptée","cohérent","cohérente","pertinent","pertinente","fiable","valide","strict","stricte","minimum","maximal","maximale","interne","externe","public","publique","privé","privée","spécifique","générique","général","générale","opérationnel","opérationnelle","instant","instantanément","temporaire","temporairement","permanent","permanente","retard","anticipé","anticiper","horaire","date","durée","période","intervalle","moment","fois","fréquence","rapidité","vitesse","intensité","magnitude","force","puissance","niveau","taux","ratio","proportion","pourcentage","degré","amplitude","étendue","surface","volume","capacité","quantité","nombre","total","partie","totalité","majorité","minorité","totalité","ensemble","ensemble","groupe","groupes","catégorie","catégories","classe","classes","famille","familles","branche","branches","partie","ensembles","élémentaires","structure","structures","infrastructure","infrastructures","équipement","équipements","moyen","moyens","ressource","ressources","dispositif","dispositifs","mécanisme","mécanismes","système","systèmes","processus","processus","protocole","protocoles","procédure","procédures","phase","phases","étape","étapes","tâche","tâches","fonction","fonctions","rôle","rôles","effet","effets","impact","impacts","conséquence","conséquences","cause","causes","origine","sources","source","symptôme","symptômes","signe","signes","indicateur","indicateurs","alerte","alertes","signal","signaux","danger","risques","risque","menace","menaces","protection","sécurité","santé","sûreté","sécurisé","sécurisée","urgent","urgence","urgences","alerte","notification","message","consigne","consignes","recommandation","recommandations","indication","indications","demande","demandes","requête","requêtes","action","actions","mesure","mesures","décision","décisions","validation","confirmée","confirmé","enregistré","enregistrée","enregistrés","stockés","activé","activée","désactivé","désactivée","ouvert","ouverte","fermé","fermée","bloqué","bloquée","débloqué","débloquée","détruit","détruite","endommagé","endommagée","touché","touchée","atteint","atteinte","concerné","concernée","impliqué","impliquée","exposé","exposée","suspecté","suspectée","confirmé","infirmé","invalidé","appliqué","appliquée","utilisé","utilisée","mis","mise","posé","posée","fourni","fournie","envoyé","envoyée","reçu","reçue","transmis","transmise","ajouté","ajoutée","retiré","retirée","modifié","modifiée","complété","complétée","créé","créée","supprimé","supprimée","remplacé","remplacée","déplacé","déplacée","sélectionné","sélectionnée","marqué","marquée","identifié","identifiée","détecté","détectée","observé","observée","constaté","constatée","diagnostiqué","diagnostiquée","évalué","évaluée","vérifié","vérifiée","testé","testée","analysé","analysée","mesuré","mesurée","estimé","estimée","calculé","calculée","prédit","prédite","comparé","comparée","rapproché","rapprochée","recherché","recherchée","trouvé","trouvée","perdu","perdue","retrouvé","retrouvée","situé","située","localisé","localisée","géolocalisé","géolocalisée","rapporté","rapportée","transmis","émis","émise","diffusé","diffusée","envoyé","reçu","collecté","collectée","agrégé","agrégée","synthétisé","synthétisée","résumé","résumée","présenté","présentée","affiché","affichée","stocké","stockée","sauvegardé","sauvegardée","chargé","chargée","téléchargé","téléchargée","initialisé","initialisée","configuré","configurée","paramétré","paramétrée","calibré","calibrée","réglé","réglée","ajusté","ajustée","optimisé","optimisée","amélioré","améliorée","corrigé","corrigée","débogué","déboguée","nettoyé","nettoyée","trié","triée","filtré","filtrée","classé","classée","rangé","rangée","groupé","groupée","combiné","combinée","fusionné","fusionnée","séparé","séparée","isolé","isolée","extraits","extraits","extraite","transformé","transformée","converti","convertie","encodé","encodée","décodé","décodée","crypté","cryptée","compressé","compressée","décompressé","décompressée","archivé","archivée","sécurisé","sécurisée","chiffré","chiffrée","authentifié","authentifiée","autorisé","autorisée","validé","vérifié","approuvé","rejeté","accepté","refusé","annulé","interrompu","terminé","achevé","terminée","achevée","terminé","commencé","démarré","lancé","arrêté","suspendu","repris","continué","réinitialisé","réinitialisée","relancé","redémarré","fermé","rouvert","ouvert","terminer","achever","finaliser","compléter","commencer","initier","démarrer","lancer","stopper","arrêter","interrompre","suspendre","reprendre","continuer","abandonner","annuler","renoncer","rejeter","accepter","refuser","approuver","valider","autoriser","authentifier","confirmer","infirmer","nier","affirmer","signaler","rapporter","déclarer","annoncer","notifier","avertir","alerter","informer","communiquer","transmettre","envoyer","recevoir","répondre","poser","questionner","demander","requérir","chercher","rechercher","explorer","examiner","analyser","diagnostiquer","mesurer","calculer","estimer","prédire","comparer","vérifier","tester","contrôler","superviser","surveiller","suivre","enregistrer","sauvegarder","stocker","archiver","classer","trier","filtrer","trier","regrouper","combiner","fusionner","séparer","isoler","extraire","résumer","synthétiser","présenter","afficher","montrer","démontrer","illustrer","détailler","énumérer","décrire","expliquer","préciser","formuler","exprimer","traduire","adapter","ajuster","modifier","changer","remplacer","retirer","ajouter","insérer","supprimer","déplacer","déplacer","ordonner","organiser","structurer","planifier","sélectionner","choisir","préférer","désigner","identifier","marquer","lier","connecter","associer","rattacher","détacher","séparer","inclure","exclure","ajouter","suppléer","remplir","vider","nettoyer","restaurer","réparer","corriger","améliorer","optimiser","développer","étendre","augmenter","réduire","diminuer","limiter","restreindre","bloquer","débloquer","fermer","ouvrir","verrouiller","déverrouiller","créer","générer","construire","fabriquer","produire","concevoir","mettre","changer","transformer","concevoir","obtenir","acquérir","fournir","proposer","disposer","donner","recevoir","partager","distribuer","allouer","réserver","assigner","attribuer","affecter","autoriser","permettre","interdire","empêcher","éviter","réduire","minimiser","maximiser","accroître","favoriser","faciliter","simplifier","complexifier","clarifier","résoudre","traiter","gérer","piloter","conduire","diriger","coordonner","organiser","mener","exécuter","réaliser","effectuer","accomplir","mettre","appliquer","utiliser","employer","servir","consommer","dépenser","économiser","charger","remplir","alimenter","fournir","approvisionner","équiper","munir","septembre","octobre","novembre","décembre","janvier","février","mars","avril","mai","juin","juillet","août"
  ]);
  const lexiconWhite = opts?.lexiconWhiteList ?? new Set<string>();
  const calcCoverage = (txt: string): number => {
    const tokens = txt
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9\u0600-\u06FF]+/)
      .filter((w) => w.length >= 3);
    if (!tokens.length) return 0;
    let ok = 0;
    for (const w of tokens) {
      if (kwSet.has(w) || STOP_WHITELIST.has(w) || lexiconWhite.has(w)) { ok++; continue; }
      /* Approximations toponymes : mot qui commence par majuscule
         et n'est pas en début de phrase peut passer — mais on reste strict. */
    }
    return ok / tokens.length;
  };

  const covT = calcCoverage(title);
  const covD = calcCoverage(desc);
  const MIN_COV = 0.65;
  if (covT < MIN_COV) { title = fallbackTitle; triggered = true; }
  if (covD < MIN_COV) { desc = fallbackDesc; triggered = true; }

  return { title, desc, triggered };
}

/* -------------------- Appel Ollama chat (bas niveau) -------------------- */

interface ChatOpts {
  temperature?: number;
  signal?: AbortSignal;
}

async function ollamaChatRaw(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: ChatOpts = {},
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cfg = defaultCfg();
  const temperature = opts.temperature ?? 0.3;
  const ctrl = opts.signal ? { signal: opts.signal } : {};
  try {
    const resp = await fetch(`${cfg.endpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        stream: false,
        options: {
          temperature,
          num_ctx: 16384,
          num_batch: 128,
        },
        messages,
      }),
      ...ctrl,
    });
    if (!resp.ok) {
      let body = "";
      try { body = await resp.text(); } catch { /* ignore */ }
      let short = body.slice(0, 400);
      if (short.includes("signal: killed")) short = "processus tué (OOM)";
      return { ok: false, error: `HTTP ${resp.status} · ${short || "erreur Ollama"}` };
    }
    const data = await resp.json();
    const text: string = data?.message?.content ?? "";
    return { ok: true, text };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "réseau";
    if (msg.toLowerCase().includes("abort")) return { ok: false, error: "timeout" };
    return { ok: false, error: msg };
  }
}

/* -------------------- API publique : GENERATE -------------------- */

/**
 * Génère un brouillon Titre+Description à partir de mots-clés.
 * 1ère intention : appel LLM Ollama local ; en cas d'échec → fallback déterministe.
 */
export async function generateIncidentDraft(
  keywords: string[],
  input: DescriptionProposalInput,
  opts?: { salt?: number },
): Promise<IncidentDraftResult> {
  const salt = opts?.salt ?? 1;
  const fallbackTitle = pickTitle(input, salt);
  const fallbackDesc = pickDesc(input, salt);

  // Si aucun keyword, pas de sens à appeler le LLM → fallback direct
  if (!keywords.length) {
    return { title: fallbackTitle, desc: fallbackDesc, fallback: true };
  }

  const typeLabel = input.type ?? "incident";
  const formToponyms = [input.ville?.trim(), input.province?.trim(), input.adresse?.trim()].filter(Boolean) as string[];
  const kwToponyms = extractToponymsFromTokens(keywords);
  const confirmedToponyms = (() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const x of [...formToponyms, ...kwToponyms]) {
      const k = x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (k && !seen.has(k)) { seen.add(k); merged.push(x); }
    }
    return merged;
  })();

  const lieuSection = confirmedToponyms.length
    ? [
        "## LIEUX CONFIRMÉS (R0 OBLIGATOIRE · chacun doit figurer DANS title ET dans desc)",
        ...confirmedToponyms.map((t) => `  - ${t}`),
        "",
        "CONTRAINTE R0 : Chaque élément de la liste ci-dessus est UN LIEU CONFIRMÉ issu des mots-clés ou champs structurés. Tu dois :",
        "  1) le mentionner explicitement (terme exact) dans `title` (ex: « … — Mohammedia »)",
        "  2) le mentionner explicitement au moins une fois dans `desc` (ex: « Un incident est rapporté au niveau de Mohammedia… »)",
        "Jamais d'exception.",
      ].join("\n")
    : [
        "## LIEUX CONFIRMÉS",
        "(aucun fourni → respecte R1 : N'INVENTE JAMAIS de ville, province, adresse, quartier, site, pays, région).",
      ].join("\n");

  const userMsg = [
    "## TYPE D'INCIDENT (catégorie choisie par l'opérateur)",
    typeLabel,
    "",
    "## MOTS-CLÉS SAISIS PAR L'OPÉRATEUR (UNIQUEMENT CES ÉLÉMENTS, RIEN D'AUTRE)",
    keywords.map((k) => `  - ${k}`).join("\n"),
    "",
    lieuSection,
    "",
    "## MODE",
    "génération initiale : produis un titre court (8-120 caractères) et une description factuelle 2-3 phrases.",
    "",
    "Sortie : UNIQUEMENT le bloc JSON comme indiqué, rien d'autre.",
  ].join("\n");

  let text = "";
  let llmError: string | undefined;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const r = await ollamaChatRaw(
      [
        { role: "system", content: SYSTEM_DRAFT },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.3, signal: ctrl.signal },
    );
    clearTimeout(timeout);
    if (r.ok) text = r.text;
    else llmError = r.error;
  } catch (e) {
    llmError = e instanceof Error ? e.message : "erreur inconnue";
  }

  if (text) {
    const parsed = extractJsonBlock(text);
    if (parsed) {
      /* ====== DURCISSEMENT S0 : lexique sémantique (IncidentDraftAssist.ALL_LEXICON_UNION)
         transmis à sanitizeDraft pour élargir la blanche liste et réduire
         les faux-positifs sur les mots « sécheresse », « incendie », « victimes », etc.
         qui appartiennent au lexique métier mais pas toujours explicitement dans
         le keyword list de l'opérateur. */
      const lexiconUnion = (() => {
        try {
          const inc = (globalThis as any).__ARGOS_LEXICON__ as Set<string> | undefined;
          return inc ?? new Set<string>();
        } catch { return new Set<string>(); }
      })();

      let cleanRes = sanitizeDraft(parsed, keywords, fallbackTitle, fallbackDesc, { lexiconWhiteList: lexiconUnion });
      let clean = { title: cleanRes.title, desc: cleanRes.desc };

      // ========= ENFORCEMENT R0 : chaque lieu confirmé doit être DANS title ET desc =========
      if (clean.title && clean.desc && confirmedToponyms.length) {
        const normInText = (t: string, txt: string): boolean => {
          const n = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          const nt = txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          return !!n && nt.includes(n);
        };
        let tTitle = clean.title;
        let tDesc = clean.desc;
        for (const topo of confirmedToponyms) {
          if (!normInText(topo, tTitle)) {
            tTitle = `${tTitle} — ${topo.charAt(0).toUpperCase() + topo.slice(1)}`;
          }
          if (!normInText(topo, tDesc)) {
            const tPretty = topo.charAt(0).toUpperCase() + topo.slice(1);
            const prefix = `Au niveau de ${tPretty} : `;
            if (tDesc.includes(".")) {
              const firstDot = tDesc.indexOf(".");
              const sentence1 = tDesc.slice(0, firstDot + 1);
              const rest = tDesc.slice(firstDot + 1).trim();
              tDesc = rest
                ? `${sentence1.slice(0, -1)} à ${tPretty}. ${rest}`
                : `${sentence1.slice(0, -1)} à ${tPretty}.`;
            } else {
              tDesc = `${prefix}${tDesc.charAt(0).toLowerCase() + tDesc.slice(1)}`;
            }
            if (!normInText(topo, tDesc)) tDesc = `${tDesc}  Localisation confirmée : ${tPretty}.`;
          }
        }
        tTitle = tTitle.replace(/\s+/g, " ").trim();
        tDesc = tDesc.replace(/\s+/g, " ").trim();
        clean = { title: tTitle, desc: tDesc };
      }

      /* ====== DURCISSEMENT S4 : ÉCART LLM vs FALLBACK SÉMANTIQUE > 40 % → FALLBACK FORCÉ.
         Stratégie : on calcule un ratio de chevauchement lexical normalisé entre la
         réponse du LLM post-sanitize et le fallback déterministe pickTitle/pickDesc.
         Si le ratio < 0.6, ça signifie que le LLM a produit un texte trop éloigné
         du périmètre autorisé par les keywords = invention probable.
         On force alors le fallback sémantique local, quel que soit le format JSON valide. */
      if (clean.title && clean.desc) {
        const tok = (s: string) =>
          new Set(
            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .split(/[^a-z0-9\u0600-\u06FF]+/)
              .filter((w) => w.length >= 3),
          );
        const overlap = (a: Set<string>, b: Set<string>): number => {
          if (a.size === 0 && b.size === 0) return 1;
          if (a.size === 0 || b.size === 0) return 0;
          let inter = 0;
          for (const w of a) if (b.has(w)) inter++;
          return inter / Math.min(a.size, b.size);
        };
        const titleOverlap = overlap(tok(clean.title), tok(fallbackTitle));
        const descOverlap = overlap(tok(clean.desc), tok(fallbackDesc));
        const MIN_OVERLAP = 0.60;
        if (titleOverlap < MIN_OVERLAP || descOverlap < MIN_OVERLAP || cleanRes.triggered) {
          return { title: fallbackTitle, desc: fallbackDesc, fallback: true, llmError: llmError ?? `fallback forcé: overlap=${(Math.min(titleOverlap,descOverlap)*100).toFixed(0)}%` };
        }
        return { title: clean.title, desc: clean.desc, fallback: false, llmError: undefined };
      }
    } else {
      llmError = llmError ?? "réponse LLM sans JSON exploitable";
    }
  }

  // ===== Fallback déterministe =====
  return {
    title: fallbackTitle,
    desc: fallbackDesc,
    fallback: true,
    llmError,
  };
}

/* -------------------- API publique : PARAPHRASE -------------------- */

/**
 * Paraphrase stricte du titre et/ou de la description.
 * Si `field` est fourni → paraphrase seulement ce champ, l'autre inchangé.
 * Sinon → paraphrase les deux.
 * Si LLM KO → retombe sur pickTitle/pickDesc avec salt incrémenté (paraphrase déterministe par pools).
 */
export async function paraphraseIncidentDraft(
  opts: {
    keywords: string[];
    input: DescriptionProposalInput;
    currentTitle: string;
    currentDesc: string;
    field?: ParaphraseField;
    salt?: number;
  },
): Promise<IncidentDraftResult> {
  const { keywords, input, currentTitle, currentDesc, field, salt = 1 } = opts;

  // Fallback déterministe : pools de paraphrase via salt
  const fallbackTitle = field === "desc" ? currentTitle : pickTitle(input, salt + 1);
  const fallbackDesc = field === "title" ? currentDesc : pickDesc(input, salt + 1);

  if (!keywords.length && !currentTitle && !currentDesc) {
    return { title: fallbackTitle, desc: fallbackDesc, fallback: true };
  }

  const kwToponymsPar = extractToponymsFromTokens(keywords);
  const formToponymsPar = [input.ville?.trim(), input.province?.trim(), input.adresse?.trim()].filter(Boolean) as string[];
  const confirmedToponymsPar = (() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const x of [...formToponymsPar, ...kwToponymsPar]) {
      const k = x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (k && !seen.has(k)) { seen.add(k); merged.push(x); }
    }
    return merged;
  })();

  const userMsg = [
    "## CHAMP(S) À PARAPHRASER",
    field === "title" ? "title uniquement (le champ `desc` devra être RENVOYÉ INCHANGÉ)" :
    field === "desc"  ? "desc uniquement (le champ `title` devra être RENVOYÉ INCHANGÉ)" :
    "title ET desc, les deux, avec reformulation indépendante.",
    "",
    "## VALEUR ACTUELLE (source de VÉRITÉ, tout le reste est INTERDIT)",
    `  Title: « ${currentTitle} »`,
    `  Desc:  « ${currentDesc} »`,
    "",
    "## RAPPEL RÈGLES P1..P5 :",
    "  - même infos factuelles, rien ajouté, rien retiré",
    "  - formulation 100% différente (pas de simple remplacement 1 mot)",
    "  - si original parle de « risque », rester au même niveau",
    "",
    "MOTS-CLÉS rappel (seulement pour vérifier ce qui est autorisé) :",
    keywords.length ? keywords.map((k) => `  - ${k}`).join("\n") : "  (aucun)",
    "",
    "Sortie : UNIQUEMENT le bloc JSON comme indiqué, rien d'autre.",
  ].join("\n");

  let text = "";
  let llmError: string | undefined;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const r = await ollamaChatRaw(
      [
        { role: "system", content: SYSTEM_PARAPHRASE },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.4, signal: ctrl.signal },
    );
    clearTimeout(timeout);
    if (r.ok) text = r.text;
    else llmError = r.error;
  } catch (e) {
    llmError = e instanceof Error ? e.message : "erreur inconnue";
  }

  if (text) {
    const parsed = extractJsonBlock(text);
    if (parsed) {
      const tRaw = typeof parsed.title === "string" ? parsed.title.trim() : "";
      const dRaw = typeof parsed.desc === "string" ? parsed.desc.trim() : "";
      const tOk = field !== "title" ? currentTitle : tRaw;
      const dOk = field !== "desc" ? currentDesc : dRaw;
      let title = tOk || fallbackTitle;
      let desc = dOk || fallbackDesc;

      const lexiconUnionPar = (() => {
        try {
          const inc = (globalThis as any).__ARGOS_LEXICON__ as Set<string> | undefined;
          return inc ?? new Set<string>();
        } catch { return new Set<string>(); }
      })();

      const clean0 = sanitizeDraft({ title, desc }, keywords, fallbackTitle, fallbackDesc, { lexiconWhiteList: lexiconUnionPar });
      let triggered = clean0.triggered;
      title = clean0.title; desc = clean0.desc;

      // ========= ENFORCEMENT R0 : toponymes présents dans paraphrase =========
      if (title && desc && confirmedToponymsPar.length) {
        const normInText = (t: string, txt: string): boolean => {
          const n = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          const nt = txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          return !!n && nt.includes(n);
        };
        for (const topo of confirmedToponymsPar) {
          if (!normInText(topo, title)) title = `${title} — ${topo.charAt(0).toUpperCase() + topo.slice(1)}`;
          if (!normInText(topo, desc)) {
            const tPretty = topo.charAt(0).toUpperCase() + topo.slice(1);
            if (desc.includes(".")) {
              const firstDot = desc.indexOf(".");
              const s1 = desc.slice(0, firstDot + 1);
              const rest = desc.slice(firstDot + 1).trim();
              desc = rest ? `${s1.slice(0, -1)} à ${tPretty}. ${rest}` : `${s1.slice(0, -1)} à ${tPretty}.`;
            } else {
              desc = `Au niveau de ${tPretty} : ${desc.charAt(0).toLowerCase() + desc.slice(1)}`;
            }
            if (!normInText(topo, desc)) desc = `${desc}  Localisation confirmée : ${tPretty}.`;
          }
        }
        title = title.replace(/\s+/g, " ").trim();
        desc = desc.replace(/\s+/g, " ").trim();
      }
      const clean2 = sanitizeDraft({ title, desc }, keywords, fallbackTitle, fallbackDesc, { lexiconWhiteList: lexiconUnionPar });
      triggered = triggered || clean2.triggered;
      title = clean2.title; desc = clean2.desc;

      /* ====== S4 paraphrase : chevauchement avec source de vérité ======
         Pour paraphrase, on compare avec currentTitle/currentDesc (valeurs d'origine
         qui sont la source de VÉRITÉ absolue), pas avec fallback. */
      if (title && desc) {
        const tok = (s: string) =>
          new Set(
            s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .split(/[^a-z0-9\u0600-\u06FF]+/)
              .filter((w) => w.length >= 3),
          );
        const overlap = (a: Set<string>, b: Set<string>): number => {
          if (a.size === 0 && b.size === 0) return 1;
          if (a.size === 0 || b.size === 0) return 0;
          let inter = 0;
          for (const w of a) if (b.has(w)) inter++;
          return inter / Math.min(a.size, b.size);
        };
        const baseTitleForCompare = field === "desc" ? currentTitle : fallbackTitle;
        const baseDescForCompare = field === "title" ? currentDesc : fallbackDesc;
        const titleOverlap = overlap(tok(title), tok(baseTitleForCompare));
        const descOverlap = overlap(tok(desc), tok(baseDescForCompare));
        const MIN_OVERLAP_PARA = 0.55;
        if (titleOverlap < MIN_OVERLAP_PARA || descOverlap < MIN_OVERLAP_PARA || triggered) {
          return { title: fallbackTitle, desc: fallbackDesc, fallback: true, llmError: llmError ?? `fallback paraphrase forcée: overlapT=${(titleOverlap*100).toFixed(0)}% overlapD=${(descOverlap*100).toFixed(0)}%` };
        }
        return { title, desc, fallback: false, llmError: undefined };
      }
    } else {
      llmError = llmError ?? "réponse LLM sans JSON exploitable";
    }
  }

  return {
    title: fallbackTitle,
    desc: fallbackDesc,
    fallback: true,
    llmError,
  };
}
