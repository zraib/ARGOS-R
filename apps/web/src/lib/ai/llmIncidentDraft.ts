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

/** Validation post-LLM : blanchit toute invention éventuelle avant affichage.
 *  Vérifie la présence des motifs interdits NON PRÉSENTS dans les mots-clés.
 */
function sanitizeDraft(
  parsed: any,
  keywords: string[],
  fallbackTitle: string,
  fallbackDesc: string,
): { title: string; desc: string } {
  const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
  const desc = typeof parsed?.desc === "string" ? parsed.desc.trim() : "";
  if (!title || !desc) return { title: fallbackTitle, desc: fallbackDesc };

  const kwNorm = keywords.map((k) => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""));
  const forbiddenRegexes: RegExp[] = [
    /reconnaissance\s+terrain/i,
    /camion[\s-]?citerne/i,
    /distribution\s+d['']?eau/i,
    /périmètre\s+de\s+sécurité/i,
    /coordination\s+(des|avec|du|entre|inter?)/i,
    /montée\s+en\s+puissance/i,
    /équipes?\s+(déployées?|mobilisées?|engagées?|de\s+secours|d['']intervention|spécialisées?)/i,
    /déploiement/i,
    /plan\s+d[''](eau|action|urgence|secours|contingence|évacuation|distribution)/i,
    /espaces?\s+rafraîchis/i,
    /visites?\s+(aux?\s+personnes|personnes\s+âgées|à\s+domicile)/i,
    /sensibilisation/i,
    /(renforts?|renforcement\s+(des|d['']))/i,
    /commandement|poste\s+de\s+commandement|PC\s+opérations?/i,
    /prise\s+en\s+charge/i,
    /évacuation\s+(préventive|obligatoire|des\s+zones|des\s+personnes)/i,
    /ouverture\s+(d['']?lieux|d['']espaces|d['']centres|d['']hébergements)/i,
    /sécurisation\s+(des\s+zones|du\s+périmètre|des\s+sites)/i,
  ];
  const kwHit = (pattern: RegExp) => kwNorm.some((k) => pattern.test(k));
  const textHit = (t: string, pattern: RegExp) => pattern.test(t);
  const hasForbidden = (t: string) =>
    forbiddenRegexes.some((r) => !kwHit(r) && textHit(t, r));
  const t = hasForbidden(title) ? fallbackTitle : title;
  const d = hasForbidden(desc) ? fallbackDesc : desc;
  return { title: t, desc: d };
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
      let clean = sanitizeDraft(parsed, keywords, fallbackTitle, fallbackDesc);
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
            // Préfixe phrase synthétique si la description commence
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
            // Si malgré tout toponyme pas présent (cas ponctuation complexe), append final
            if (!normInText(topo, tDesc)) tDesc = `${tDesc}  Localisation confirmée : ${tPretty}.`;
          }
        }
        tTitle = tTitle.replace(/\s+/g, " ").trim();
        tDesc = tDesc.replace(/\s+/g, " ").trim();
        clean = { title: tTitle, desc: tDesc };
      }
      if (clean.title && clean.desc) {
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
      // Retourne toujours les deux champs ; si un seul est vide on prend le fallback.
      let title = tOk || fallbackTitle;
      let desc = dOk || fallbackDesc;
      const clean0 = sanitizeDraft({ title, desc }, keywords, fallbackTitle, fallbackDesc);
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
      const clean = sanitizeDraft({ title, desc }, keywords, fallbackTitle, fallbackDesc);
      if (clean.title && clean.desc) {
        return { title: clean.title, desc: clean.desc, fallback: false, llmError: undefined };
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
