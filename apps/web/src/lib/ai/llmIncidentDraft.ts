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
  getAllLexiconUnion,
  toponymsFromKeywords,
  type DraftLabels,
  mergeDraftLabels,
} from "@/lib/ai/draft";
import { chatComplete } from "@/lib/ai/provider";
import {
  AI_DEFAULT_PROVIDER,
  AI_PROVIDERS,
  AI_TIMEOUT_MS,
  type LlmProviderConfig,
} from "@/lib/ai/config";
import { tpl as tplStr } from "@/lib/i18n/format";
import type { Lang } from "@/lib/types";

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

function buildSystemDraft(lang: Lang): string {
  if (lang === "en") {
    return [
      "You are the incident report drafting assistant for IRIS, the military disaster management platform.",
      "Your only task: produce a short, professional TITLE, then a factual DESCRIPTION based on the keywords provided by the operator.",
      "",
      "MANDATORY RULES (follow them WITHOUT EXCEPTION):",
      "[R0] MANDATORY TOPONYMS — EVERY location (city, province, region, country, district, address, place name, site, geographic area) explicitly WRITTEN in the provided KEYWORDS or in the LOCATION section below MUST imperatively:",
      "     1) appear IN THE TITLE (field `title`),",
      "     2) appear AT LEAST ONCE IN THE DESCRIPTION (field `desc`).",
      "     You NEVER ignore a location, you NEVER omit it, you NEVER turn it into a synonym. You use the EXACT term as provided.",
      "[R1] YOU INVENT NOTHING. No location, date, figure, casualty count, person's name, street name, postal code, coordinates, temperature, magnitude, area, duration may appear unless they are EXPLICITLY WRITTEN in the provided keywords.",
      "[R2] NO operational actions. You NEVER mention: field reconnaissance, security perimeter, preventive evacuation, reinforcements, team deployment, distribution plan, water tanker, water distribution, coordination, command, care management, opening of sites, awareness, cooling spaces, visits of persons, securing, scaling up, nor any measure, recommendation, engaged asset, operational action, instruction, procedure or safety instruction — UNLESS one of these terms is LITERALLY PRESENT in the provided keywords.",
      "[R3] You NEVER turn potential information or a risk into a confirmed event. If keywords mention a 'risk' → stay on the term 'risk'; do not say 'collapse' if 'risk of collapse' was written.",
      "[R4] You do NOT make lists. You do NOT copy the keywords one after another separated by dashes or commas. You ONLY rephrase into natural, coherent sentences.",
      "[R5] The DESCRIPTION is a FACTUAL SUMMARY: 2 to 3 short sentences, solely based on the keywords + deduced incident type. It must NEVER be an action plan, a procedure, or a recommendation.",
      "[R6] You may DEDUCE the overall incident type from keywords (e.g. 'water shortage, dry soils, hydric stress' → type 'drought'). This deduction is authorized and recommended; it is NOT considered invention, provided no numeric or location details are added.",
      "[R7] If a keyword is ambiguous or incomplete, interpret it strictly, without extrapolation. If the information is not there → do NOT mention it.",
      "[R8] Write ENTIRELY in English. Every single word of title AND description must be in English, except proper nouns (place names, person names) which stay as provided.",
      "",
      "MANDATORY OUTPUT FORMAT (strictly identical for every response, nothing else, no preamble, no comment, no Markdown):",
      "  ```json",
      "  { \"title\": \"…\", \"desc\": \"…\" }",
      "  ```",
      "",
      "Example:",
      "  Input: type=drought ; keywords = [\"Water shortage\", \"Dry soils\", \"Hydric stress\"]",
      "  Expected output:",
      "  ```json",
      "  { \"title\": \"Drought — Water shortage reported\", \"desc\": \"A drought context is reported. Hydric stress is observed in the area; dry soils are noted; a water shortage is signalled.\" }",
      "  ```",
      "",
      "Important: reply ONLY with the ```json…``` block, preceded and followed by a blank line if needed. Nothing else, thank you.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      "أنت مساعد صياغة تقارير الحوادث لمنصة إيريس (IRIS) العسكرية لإدارة الكوارث.",
      "مهمتك الوحيدة: إنتاج عنوان قصير ومهني TITLE، ثم وصف واقعي DESCRIPTION بناءً على الكلمات المفتاحية المقدمة من المشغل.",
      "",
      "قواعد إلزامية (تلتزم بها بدون استثناء):",
      "[R0] الأسماء الجغرافية إلزامية — كل موقع (مدينة، مقاطعة، منطقة، بلد، حي، عنوان، اسم مكان، موقع، منطقة جغرافية) مكتوب صراحة في الكلمات المفتاحية أو في قسم LOCALIZATION أدناه يجب أن:",
      "     1) يظهر في العنوان (الحقل `title`)،",
      "     2) يظهر مرة واحدة على الأقل في الوصف (الحقل `desc`).",
      "     لا تتجاهل أبداً أي موقع، لا تحذفه أبداً، لا تحوله أبداً إلى مرادف. استخدم المصطلح بالضبط كما هو مقدم.",
      "[R1] لا تخترع شيئاً. لا يُسمح بظهور أي موقع، تاريخ، رقم، عدد ضحايا، اسم شخص، اسم شارع، رمز بريدي، إحداثيات، درجة حرارة، زلزال، مساحة، مدة إلا إذا كانت مكتوبة صراحة في الكلمات المفتاحية.",
      "[R2] لا إجراءات تشغيلية. لا تذكر أبداً: استكشاف ميداني، محيط أمني، إخلاء وقائي، تعزيزات، نشر فرق، خطة توزيع، صهريج ماء، توزيع مياه، تنسيق، قيادة، رعاية، فتح مواقع، توعية، مساحات تبريد، زيارات أشخاص، تأمين، تصعيد، ولا أي تدبير أو توصية أو وسيلة منشغلة أو إجراء تشغيلي أو تعليمات أو إجراءات أمان — إلا إذا كان أحد هذه المصطلحات موجوداً حرفياً في الكلمات المفتاحية.",
      "[R3] لا تحول أبداً معلومة محتملة أو خطراً إلى حدث مؤكد. إذا ذكرت الكلمات المفتاحية \"خطر\" → ابق على مصطلح \"خطر\"؛ لا تقل \"انهيار\" إذا كُتب \"خطر انهيار\".",
      "[R4] لا تصنع قوائم. لا تنسخ الكلمات المفتاحية متتالية مفصولة بشرطات أو فواصل. أعد الصياغة فقط إلى جمل طبيعية متماسكة.",
      "[R5] الوصف هو ملخص واقعي: جملتان إلى 3 جمل قصيرة، تستند فقط إلى الكلمات المفتاحية + نوع الحادث المستنتج. يجب ألا يكون أبداً خطة عمل، إجراءً، أو توصية.",
      "[R6] يمكنك استنتاج نوع الحادث العام من الكلمات المفتاحية (مثال: \"نقص مياه، تربة جافة، إجهاد مائي\" → نوع \"جفاف\"). هذا الاستنتاج مسموح وموصى به؛ لا يعتبر اختراعاً، بشرط عدم إضافة تفاصيل رقمية أو مواقع.",
      "[R7] إذا كانت كلمة مفتاحية غامضة أو ناقصة، فسرها بصرامة دون استقراء. إذا لم تكن المعلومة هناك → لا تذكرها.",
      "[R8] اكتب باللغة العربية بالكامل. كل كلمة في العنوان والوصف يجب أن تكون بالعربية، باستثناء الأسماء الخاصة (أسماء الأماكن، أسماء الأشخاص) التي تبقى كما هي مكتوبة.",
      "",
      "تنسيق الإخراج الإلزامي (متطابق بدقة لكل رد، لا شيء آخر، لا مقدمات، لا تعليقات، لا Markdown):",
      "  ```json",
      "  { \"title\": \"…\", \"desc\": \"…\" }",
      "  ```",
      "",
      "مثال:",
      "  المدخلات: type=جفاف ; الكلمات المفتاحية = [\"نقص مياه\", \"تربة جافة\", \"إجهاد مائي\"]",
      "  الإخراج المتوقع:",
      "  ```json",
      "  { \"title\": \"جفاف — الإبلاغ عن نقص مياه\", \"desc\": \"يتم الإبلاغ عن سياق جفاف. لوحظ إجهاد مائي في المنطقة؛ سُجلت تربات جافة؛ وتم الإبلاغ عن نقص مياه.\" }",
      "  ```",
      "",
      "مهم: أجب فقط بكتلة ```json…```، مسبوقة ومتبوعة بسطر فارغ إذا لزم الأمر. لا شيء آخر، شكراً.",
    ].join("\n");
  }
  // fr — default, retrocompat strict
  return [
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
}

function buildSystemParaphrase(lang: Lang): string {
  if (lang === "en") {
    return [
      "You are the incident report paraphrasing assistant for IRIS.",
      "Your one and only task: PARAPHRASE the title and/or description provided to you.",
      "",
      "MANDATORY RULES:",
      "[P1] SAME EXACT FACTUAL CONTENT. You add NO information, NO detail, NO figure, NO location, NO action, NO recommendation, NO element that is NOT PRESENT in the original text.",
      "[P2] NO DELETION. You do NOT remove ANY information that appears in the original text (keywords, incident type, observations).",
      "[P3] SAME MEANING, SAME UNCERTAINTY LEVEL. If the original text says 'risk', you keep a term of the same level (e.g. 'risk', 'possibility of'); you NEVER turn it into a confirmed event.",
      "[P4] 100% DIFFERENT FORMULATION. Use synonyms, a different sentence structure, a different order. Avoid reusing the same groups of 3+ identical words as much as possible.",
      "[P5] STYLE: professional, concise, natural sentences. Write ENTIRELY in English. Every single word must be in English, except proper nouns (place names, person names) which stay as provided.",
      "",
      "MANDATORY OUTPUT FORMAT:",
      "  ```json",
      "  { \"title\": \"…\", \"desc\": \"…\" }",
      "  ```",
      "",
      "If only one field must be paraphrased, you still return BOTH fields (the other unchanged). Nothing else in the reply, no preamble, no comment.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      "أنت مساعد إعادة صياغة تقارير الحوادث لمنصة إيريس (IRIS).",
      "مهمتك الوحيدة: إعادة صياغة (PARAPHRASE) العنوان و/أو الوصف المقدم إليك.",
      "",
      "قواعد إلزامية:",
      "[P1] نفس المحتوى الواقعي بالضبط. لا تضيف أي معلومة، أي تفصيل، أي رقم، أي موقع، أي إجراء، أي توصية، أي عنصر غير موجود في النص الأصلي.",
      "[P2] لا حذف. لا تحذف أي معلومة تظهر في النص الأصلي (كلمات مفتاحية، نوع الحادث، ملاحظات).",
      "[P3] نفس المعنى، نفس مستوى عدم اليقين. إذا قال النص الأصلي \"خطر\"، فابق على مصطلح من نفس المستوى (مثل \"خطر\"، \"إمكانية\")؛ لا تحوله أبداً إلى حدث مؤكد.",
      "[P4] صياغة مختلفة بنسبة 100%. استخدم مرادفات، بنية جملة مختلفة، ترتيباً مختلفاً. تجنب قدر الإمكان إعادة نفس المجموعات من 3 كلمات متطابقة أو أكثر.",
      "[P5] الأسلوب: مهني، موجز، جمل طبيعية. اكتب باللغة العربية بالكامل. كل كلمة يجب أن تكون بالعربية، باستثناء الأسماء الخاصة (أسماء الأماكن، أسماء الأشخاص) التي تبقى كما هي مكتوبة.",
      "",
      "تنسيق الإخراج الإلزامي:",
      "  ```json",
      "  { \"title\": \"…\", \"desc\": \"…\" }",
      "  ```",
      "",
      "إذا كان هناك حقل واحد فقط يجب إعادة صياغته، فلا تزل تُرجع الحقلين (الآخر دون تغيير). لا شيء آخر في الرد، لا مقدمات، لا تعليقات.",
    ].join("\n");
  }
  // fr — default, retrocompat strict
  return [
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
}

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
export function sanitizeDraft(
  parsed: any,
  keywords: string[],
  fallbackTitle: string,
  fallbackDesc: string,
  opts?: { lexiconWhiteList?: Set<string>; minCoverage?: number },
): { title: string; desc: string; triggered: boolean } {
  const titleRaw = typeof parsed?.title === "string" ? parsed.title.trim() : "";
  const descRaw = typeof parsed?.desc === "string" ? parsed.desc.trim() : "";
  if (!titleRaw || !descRaw) return { title: fallbackTitle, desc: fallbackDesc, triggered: true };
  let title = stripUnauthorizedNumbers(titleRaw, keywords);
  let desc = stripUnauthorizedNumbers(descRaw, keywords);

  // Un mot-clé est une puce, et une puce peut être une PHRASE (« maisons
  // inondées ») : la couverture se mesure mot à mot, sinon la puce entière
  // devient un seul jeton que rien dans la réponse ne peut égaler, et le
  // modèle est accusé d'inventer les mots mêmes que l'opérateur a saisis.
  const kwNorm = keywords
    .flatMap((k) => k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/))
    .filter(Boolean);
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
  // NORMALISÉE COMME LES JETONS. La couverture compare des mots dépouillés de
  // leurs accents (« signalé » → « signale ») ; écrite avec ses accents, la
  // liste ne reconnaissait pas ses propres mots — « signalé », « constatés »,
  // « présents » comptaient comme des inventions, et une description fidèle
  // tombait juste sous le seuil (mesuré : 0,64 pour 0,65).
  const STOP_WHITELIST = new Set([
    "le","la","les","un","une","des","du","de","au","aux","a","à","et","ou","mais","donc","or","ni","car","que","qui","quoi","dont","ou","où","ça","ca","ce","cette","ces","mon","ma","mes","ton","ta","tes","son","sa","ses","notre","votre","leur","leurs","je","tu","il","elle","on","nous","vous","ils","elles","pour","par","sur","sous","dans","vers","entre","en","avec","sans","selon","après","avant","pendant","afin","suite","partir","via","ainsi","aussi","comme","depuis","quand","lorsque","alors","bien","mal","tout","tous","toute","toutes","aucun","aucune","autre","autres","même","meme","chaque","quel","quelle","quels","quelles","déjà","deja","ici","là","oui","non","encore","toujours","jamais","souvent","parfois","rarement","rapidement","lentement","actuellement","préalablement","préalable","éventuellement","ultérieurement","prochainement","immédiatement","immédiat","étape","étapes","niveau","niveaux","point","points","cadre","cas","sens","évaluation","évaluations","vérification","vérifications","confirmation","confirmations","signalement","signalements","information","informations","donnée","données","contexte","élément","éléments","détail","détails","aspect","aspects","caractéristique","caractéristiques","mentionné","mentionnée","mentionnés","mentionnées","signalé","signalée","signalés","signalées","rapporté","rapportée","rapportés","rapportées","indiqué","indiquée","indiqués","indiquées","saisi","saisie","saisis","saisies","transmis","transmise","transmis","transmises","fourni","fournie","fournis","fournies","présent","présente","présents","présentes","disponible","disponibles","nécessaire","nécessaires","obligatoire","obligatoires","potentiel","potentielle","potentiels","potentielles","possible","possibles","probable","probables","susceptible","susceptibles","concerne","concernés","concernées","associé","associée","associés","associées","observé","observée","observés","observées","constaté","constatée","constatés","constatées","identifié","identifiée","identifiés","identifiées","détecté","détectée","détectés","détectées","repéré","repérée","repérés","repérées","mesure","mesures","prévoir","prévue","prévus","attendre","attendu","attendue","attendus","attendues","courant","courante","suivant","suivante","précédent","précédente","global","globale","local","locale","complet","complète","partiel","partielle","exact","exacte","précis","précise","fin","finale","final","initial","initiale","supplémentaire","complémentaire","complémentaires","hors","hors","zone","zones","lieu","lieux","site","sites","secteur","secteurs","région","régions","ville","villes","province","provinces","adresse","quartier","pays","type","nature","formulation","texte","valeur","champ","champs","terme","termes","exprimé","nécessite","requiert","reste","restent","reste","font","fait","sont","est","étaient","était","sera","seront","étant","avoir","être","faisant","fait","faisable","permettant","permet","permettra","possible","faisant","tenant","compte","respectivement","uniquement","seulement","notamment","explicitement","implicitement","directement","indirectement","ensuite","finalement","initialement","préalablement","durant","pendant","environ","approximativement","chacun","chacune","nombreux","nombreuses","divers","diverses","plusieurs","quelques","certains","certaines","trop","assez","peu","beaucoup","très","fort","faible","haut","élevé","bas","critique","important","importante","majeure","mineur","mineure","grave","léger","légère","modéré","modérée","élevé","élevée","nominale","nominal","acceptable","inacceptable","suffisant","suffisante","insuffisant","insuffisante","approprié","appropriée","adapté","adaptée","cohérent","cohérente","pertinent","pertinente","fiable","valide","strict","stricte","minimum","maximal","maximale","interne","externe","public","publique","privé","privée","spécifique","générique","général","générale","opérationnel","opérationnelle","instant","instantanément","temporaire","temporairement","permanent","permanente","retard","anticipé","anticiper","horaire","date","durée","période","intervalle","moment","fois","fréquence","rapidité","vitesse","intensité","magnitude","force","puissance","niveau","taux","ratio","proportion","pourcentage","degré","amplitude","étendue","surface","volume","capacité","quantité","nombre","total","partie","totalité","majorité","minorité","totalité","ensemble","ensemble","groupe","groupes","catégorie","catégories","classe","classes","famille","familles","branche","branches","partie","ensembles","élémentaires","structure","structures","infrastructure","infrastructures","équipement","équipements","moyen","moyens","ressource","ressources","dispositif","dispositifs","mécanisme","mécanismes","système","systèmes","processus","processus","protocole","protocoles","procédure","procédures","phase","phases","étape","étapes","tâche","tâches","fonction","fonctions","rôle","rôles","effet","effets","impact","impacts","conséquence","conséquences","cause","causes","origine","sources","source","symptôme","symptômes","signe","signes","indicateur","indicateurs","alerte","alertes","signal","signaux","danger","risques","risque","menace","menaces","protection","sécurité","santé","sûreté","sécurisé","sécurisée","urgent","urgence","urgences","alerte","notification","message","consigne","consignes","recommandation","recommandations","indication","indications","demande","demandes","requête","requêtes","action","actions","mesure","mesures","décision","décisions","validation","confirmée","confirmé","enregistré","enregistrée","enregistrés","stockés","activé","activée","désactivé","désactivée","ouvert","ouverte","fermé","fermée","bloqué","bloquée","débloqué","débloquée","détruit","détruite","endommagé","endommagée","touché","touchée","atteint","atteinte","concerné","concernée","impliqué","impliquée","exposé","exposée","suspecté","suspectée","confirmé","infirmé","invalidé","appliqué","appliquée","utilisé","utilisée","mis","mise","posé","posée","fourni","fournie","envoyé","envoyée","reçu","reçue","transmis","transmise","ajouté","ajoutée","retiré","retirée","modifié","modifiée","complété","complétée","créé","créée","supprimé","supprimée","remplacé","remplacée","déplacé","déplacée","sélectionné","sélectionnée","marqué","marquée","identifié","identifiée","détecté","détectée","observé","observée","constaté","constatée","diagnostiqué","diagnostiquée","évalué","évaluée","vérifié","vérifiée","testé","testée","analysé","analysée","mesuré","mesurée","estimé","estimée","calculé","calculée","prédit","prédite","comparé","comparée","rapproché","rapprochée","recherché","recherchée","trouvé","trouvée","perdu","perdue","retrouvé","retrouvée","situé","située","localisé","localisée","géolocalisé","géolocalisée","rapporté","rapportée","transmis","émis","émise","diffusé","diffusée","envoyé","reçu","collecté","collectée","agrégé","agrégée","synthétisé","synthétisée","résumé","résumée","présenté","présentée","affiché","affichée","stocké","stockée","sauvegardé","sauvegardée","chargé","chargée","téléchargé","téléchargée","initialisé","initialisée","configuré","configurée","paramétré","paramétrée","calibré","calibrée","réglé","réglée","ajusté","ajustée","optimisé","optimisée","amélioré","améliorée","corrigé","corrigée","débogué","déboguée","nettoyé","nettoyée","trié","triée","filtré","filtrée","classé","classée","rangé","rangée","groupé","groupée","combiné","combinée","fusionné","fusionnée","séparé","séparée","isolé","isolée","extraits","extraits","extraite","transformé","transformée","converti","convertie","encodé","encodée","décodé","décodée","crypté","cryptée","compressé","compressée","décompressé","décompressée","archivé","archivée","sécurisé","sécurisée","chiffré","chiffrée","authentifié","authentifiée","autorisé","autorisée","validé","vérifié","approuvé","rejeté","accepté","refusé","annulé","interrompu","terminé","achevé","terminée","achevée","terminé","commencé","démarré","lancé","arrêté","suspendu","repris","continué","réinitialisé","réinitialisée","relancé","redémarré","fermé","rouvert","ouvert","terminer","achever","finaliser","compléter","commencer","initier","démarrer","lancer","stopper","arrêter","interrompre","suspendre","reprendre","continuer","abandonner","annuler","renoncer","rejeter","accepter","refuser","approuver","valider","autoriser","authentifier","confirmer","infirmer","nier","affirmer","signaler","rapporter","déclarer","annoncer","notifier","avertir","alerter","informer","communiquer","transmettre","envoyer","recevoir","répondre","poser","questionner","demander","requérir","chercher","rechercher","explorer","examiner","analyser","diagnostiquer","mesurer","calculer","estimer","prédire","comparer","vérifier","tester","contrôler","superviser","surveiller","suivre","enregistrer","sauvegarder","stocker","archiver","classer","trier","filtrer","trier","regrouper","combiner","fusionner","séparer","isoler","extraire","résumer","synthétiser","présenter","afficher","montrer","démontrer","illustrer","détailler","énumérer","décrire","expliquer","préciser","formuler","exprimer","traduire","adapter","ajuster","modifier","changer","remplacer","retirer","ajouter","insérer","supprimer","déplacer","déplacer","ordonner","organiser","structurer","planifier","sélectionner","choisir","préférer","désigner","identifier","marquer","lier","connecter","associer","rattacher","détacher","séparer","inclure","exclure","ajouter","suppléer","remplir","vider","nettoyer","restaurer","réparer","corriger","améliorer","optimiser","développer","étendre","augmenter","réduire","diminuer","limiter","restreindre","bloquer","débloquer","fermer","ouvrir","verrouiller","déverrouiller","créer","générer","construire","fabriquer","produire","concevoir","mettre","changer","transformer","concevoir","obtenir","acquérir","fournir","proposer","disposer","donner","recevoir","partager","distribuer","allouer","réserver","assigner","attribuer","affecter","autoriser","permettre","interdire","empêcher","éviter","réduire","minimiser","maximiser","accroître","favoriser","faciliter","simplifier","complexifier","clarifier","résoudre","traiter","gérer","piloter","conduire","diriger","coordonner","organiser","mener","exécuter","réaliser","effectuer","accomplir","mettre","appliquer","utiliser","employer","servir","consommer","dépenser","économiser","charger","remplir","alimenter","fournir","approvisionner","équiper","munir","septembre","octobre","novembre","décembre","janvier","février","mars","avril","mai","juin","juillet","août"
  ].map((w) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
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
  const MIN_COV = opts?.minCoverage ?? 0.65;
  if (covT < MIN_COV) { title = fallbackTitle; triggered = true; }
  if (covD < MIN_COV) { desc = fallbackDesc; triggered = true; }

  return { title, desc, triggered };
}

/* -------------------- Rappel des mots-clés -------------------- */

/** Jetons d'un texte : minuscules, sans accents, mots de trois lettres au moins. */
function tokensOf(text: string): Set<string> {
  return new Set(
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9\u0600-\u06FF]+/)
      .filter((w) => w.length >= 3),
  );
}

/**
 * Part des mots-clés de l'opérateur que le texte reprend (0 à 1).
 *
 * C'est la garde contre la dérive : une réponse qui laisse tomber la moitié
 * de ce que l'opérateur a saisi n'est pas la sienne. Elle remplace un
 * chevauchement avec le GABARIT déterministe qui, mesuré ici, rejetait les
 * bonnes réponses (21 à 29 % contre un seuil de 60 %) : une phrase naturelle
 * ne ressemble pas à « Contexte inondation au niveau de … — éléments
 * rapportés : … », et ce n'est pas ce qu'on lui demande. L'invention, elle,
 * est déjà tenue par S1 (couverture lexicale) et par les filtres de nombres
 * et de mots interdits.
 */
export function keywordRecall(text: string, keywords: readonly string[]): number {
  const kw = tokensOf(keywords.join(" "));
  if (kw.size === 0) return 1;
  const present = tokensOf(text);
  let hit = 0;
  for (const w of kw) if (present.has(w)) hit++;
  return hit / kw.size;
}

/** En dessous, la réponse a perdu trop de ce que l'opérateur a saisi. */
const MIN_KEYWORD_RECALL = 0.5;
/**
 * Une reformulation remplace des mots par des synonymes (« habitations » pour
 * « maisons ») : mesurée ici à 43 % sur une paraphrase fidèle. Le plancher
 * est donc plus bas ; en dessous du quart, ce n'est plus une reformulation.
 */
const MIN_KEYWORD_RECALL_PARAPHRASE = 0.25;

/* -------------------- Appel du modèle -------------------- */

interface ChatOpts {
  temperature?: number;
  signal?: AbortSignal;
  /** Fournisseur à employer — celui des Paramètres ; à défaut, le fournisseur par défaut. */
  provider?: LlmProviderConfig;
}

/**
 * Un seul chemin vers le modèle : celui du copilote (`chatComplete`). Le
 * brouillon faisait son propre `fetch`, sans `think: false` ni `keep_alive` :
 * un modèle à raisonnement dépensait tout le budget (60 s) à réfléchir avant
 * d'écrire deux lignes, puis se faisait décharger cinq minutes plus tard. Il
 * ignorait aussi le fournisseur réglé dans les Paramètres.
 */
async function ollamaChatRaw(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  opts: ChatOpts = {},
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const cfg: LlmProviderConfig = { ...(opts.provider ?? defaultCfg()), temperature: opts.temperature ?? 0.3 };
  const r = await chatComplete(cfg, messages, { signal: opts.signal });
  if (r.ok) return { ok: true, text: r.text };
  return { ok: false, error: r.aborted ? "timeout" : (r.error ?? "erreur inconnue") };
}

/* -------------------- API publique : GENERATE -------------------- */

/**
 * Génère un brouillon Titre+Description à partir de mots-clés.
 * 1ère intention : appel LLM Ollama local ; en cas d'échec → fallback déterministe.
 */
export async function generateIncidentDraft(
  keywords: string[],
  input: DescriptionProposalInput,
  opts?: { salt?: number; provider?: LlmProviderConfig; lang?: Lang; labels?: Partial<DraftLabels> },
): Promise<IncidentDraftResult> {
  const salt = opts?.salt ?? 1;
  const lang: Lang = opts?.lang ?? "fr";
  const L = mergeDraftLabels(opts?.labels);
  const fallbackTitle = pickTitle(input, salt, L);
  const fallbackDesc = pickDesc(input, salt, L);

  // Si aucun keyword, pas de sens à appeler le LLM → fallback direct
  if (!keywords.length) {
    return { title: fallbackTitle, desc: fallbackDesc, fallback: true };
  }

  const typeLabel = input.type ?? "incident";
  const formToponyms = [input.ville?.trim(), input.province?.trim(), input.adresse?.trim()].filter(Boolean) as string[];
  const kwToponyms = toponymsFromKeywords(keywords);
  const confirmedToponyms = (() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const x of [...formToponyms, ...kwToponyms]) {
      const k = x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (k && !seen.has(k)) { seen.add(k); merged.push(x); }
    }
    return merged;
  })();

  const H: Record<Lang, {
    locTitle: string; locConstraintTitle: string;
    locBullet1: string; locBullet2: string;
    locNever: string; locEmpty: string;
    typeTitle: string; kwTitle: string;
    modeTitle: string; modeDesc: string; output: string;
  }> = {
    fr: {
      locTitle: "## LIEUX CONFIRMÉS (R0 OBLIGATOIRE · chacun doit figurer DANS title ET dans desc)",
      locConstraintTitle: "CONTRAINTE R0 : Chaque élément de la liste ci-dessus est UN LIEU CONFIRMÉ issu des mots-clés ou champs structurés. Tu dois :",
      locBullet1: "  1) le mentionner explicitement (terme exact) dans `title` (ex: « … — Mohammedia »)",
      locBullet2: "  2) le mentionner explicitement au moins une fois dans `desc` (ex: « Un incident est rapporté au niveau de Mohammedia… »)",
      locNever: "Jamais d'exception.",
      locEmpty: "## LIEUX CONFIRMÉS\n(aucun fourni → respecte R1 : N'INVENTE JAMAIS de ville, province, adresse, quartier, site, pays, région).",
      typeTitle: "## TYPE D'INCIDENT (catégorie choisie par l'opérateur)",
      kwTitle: "## MOTS-CLÉS SAISIS PAR L'OPÉRATEUR (UNIQUEMENT CES ÉLÉMENTS, RIEN D'AUTRE)",
      modeTitle: "## MODE",
      modeDesc: "génération initiale : produis un titre court (8-120 caractères) et une description factuelle 2-3 phrases.",
      output: "Sortie : UNIQUEMENT le bloc JSON comme indiqué, rien d'autre.",
    },
    en: {
      locTitle: "## CONFIRMED LOCATIONS (R0 MANDATORY · each must appear IN title AND in desc)",
      locConstraintTitle: "R0 CONSTRAINT: Every item in the list above is a CONFIRMED LOCATION from keywords or structured fields. You must:",
      locBullet1: "  1) mention it explicitly (exact term) in `title` (e.g. « … — Mohammedia »)",
      locBullet2: "  2) mention it explicitly at least once in `desc` (e.g. « An incident is reported at Mohammedia… »)",
      locNever: "No exceptions ever.",
      locEmpty: "## CONFIRMED LOCATIONS\n(none provided → respect R1: NEVER INVENT a city, province, address, district, site, country, region).",
      typeTitle: "## INCIDENT TYPE (category chosen by the operator)",
      kwTitle: "## KEYWORDS ENTERED BY THE OPERATOR (ONLY THESE ITEMS, NOTHING ELSE)",
      modeTitle: "## MODE",
      modeDesc: "initial generation: produce a short title (8-120 chars) and a factual 2-3 sentence description.",
      output: "Output: ONLY the JSON block as indicated, nothing else.",
    },
    ar: {
      locTitle: "## المواقع المؤكدة (R0 إلزامي · يجب أن يظهر كل موقع في العنوان وفي الوصف)",
      locConstraintTitle: "قيد R0: كل عنصر في القائمة أعلاه هو موقع مؤكد من الكلمات المفتاحية أو الحقول المنظمة. يجب عليك:",
      locBullet1: "  1) ذكره صراحة (بالنص الدقيق) في `title` (مثل: « … — المحمدية »)",
      locBullet2: "  2) ذكره صراحة مرة واحدة على الأقل في `desc` (مثل: « تم الإبلاغ عن حادث في موقع المحمدية… »)",
      locNever: "لا استثناءات أبداً.",
      locEmpty: "## المواقع المؤكدة\n(لا يوجد أي موقع → احترم R1: لا تخترع أبداً مدينة، مقاطعة، عنوان، حي، موقع، بلد، منطقة).",
      typeTitle: "## نوع الحادث (الفئة التي اختارها المشغل)",
      kwTitle: "## الكلمات المفتاحية التي أدخلها المشغل (هذه العناصر فقط، لا شيء آخر)",
      modeTitle: "## الوضع",
      modeDesc: "توليد أولي: أنتج عنواناً قصيراً (8-120 حرفاً) ووصفاً واقعياً من جملتين إلى 3 جمل.",
      output: "الإخراج: كتلة JSON فقط كما هو موضح، لا شيء آخر.",
    },
  };
  const h = H[lang];

  const lieuSection = confirmedToponyms.length
    ? [
        h.locTitle,
        ...confirmedToponyms.map((t) => `  - ${t}`),
        "",
        h.locConstraintTitle,
        h.locBullet1,
        h.locBullet2,
        h.locNever,
      ].join("\n")
    : h.locEmpty;

  const userMsg = [
    h.typeTitle,
    typeLabel,
    "",
    h.kwTitle,
    keywords.map((k) => `  - ${k}`).join("\n"),
    "",
    lieuSection,
    "",
    h.modeTitle,
    h.modeDesc,
    "",
    h.output,
  ].join("\n");

  let text = "";
  let llmError: string | undefined;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const r = await ollamaChatRaw(
      [
        { role: "system", content: buildSystemDraft(lang) },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.3, signal: ctrl.signal, provider: opts?.provider },
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
      const lexiconUnion = getAllLexiconUnion();

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
            const prefix = tplStr(L.r0_desc_prefix_tpl, { lieu: tPretty });
            const sentencePrep = tplStr(L.r0_desc_sentence_prep, { lieu: tPretty });
            const confirmSentence = tplStr(L.r0_desc_confirm_tpl, { lieu: tPretty });
            if (tDesc.includes(".")) {
              const firstDot = tDesc.indexOf(".");
              const sentence1 = tDesc.slice(0, firstDot + 1);
              const rest = tDesc.slice(firstDot + 1).trim();
              tDesc = rest
                ? `${sentence1.slice(0, -1)} ${sentencePrep} ${rest}`
                : `${sentence1.slice(0, -1)} ${sentencePrep}.`;
            } else {
              tDesc = `${prefix}${tDesc.charAt(0).toLowerCase() + tDesc.slice(1)}`;
            }
            if (!normInText(topo, tDesc)) tDesc = `${tDesc}  ${confirmSentence}`;
          }
        }
        tTitle = tTitle.replace(/\s+/g, " ").trim();
        tDesc = tDesc.replace(/\s+/g, " ").trim();
        clean = { title: tTitle, desc: tDesc };
      }

      /* ====== S4 : la réponse reprend ce que l'opérateur a saisi ======
         Le verdict de S1 (nettoyage déclenché) force le repli ; sinon la
         réponse doit reprendre au moins la moitié des mots-clés. */
      if (clean.title && clean.desc) {
        const recall = keywordRecall(`${clean.title} ${clean.desc}`, keywords);
        if (cleanRes.triggered || recall < MIN_KEYWORD_RECALL) {
          return {
            title: fallbackTitle,
            desc: fallbackDesc,
            fallback: true,
            llmError: llmError ?? (cleanRes.triggered ? "repli forcé : nettoyage S1 déclenché" : `repli forcé : rappel des mots-clés ${(recall * 100).toFixed(0)} %`),
          };
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
    provider?: LlmProviderConfig;
    lang?: Lang;
    labels?: Partial<DraftLabels>;
  },
): Promise<IncidentDraftResult> {
  const { keywords, input, currentTitle, currentDesc, field, salt = 1 } = opts;
  const lang: Lang = opts.lang ?? "fr";
  const L = mergeDraftLabels(opts.labels);

  // Fallback déterministe : pools de paraphrase via salt
  const fallbackTitle = field === "desc" ? currentTitle : pickTitle(input, salt + 1, L);
  const fallbackDesc = field === "title" ? currentDesc : pickDesc(input, salt + 1, L);

  if (!keywords.length && !currentTitle && !currentDesc) {
    return { title: fallbackTitle, desc: fallbackDesc, fallback: true };
  }

  const kwToponymsPar = toponymsFromKeywords(keywords);
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

  const PH: Record<Lang, {
    fieldsTitle: string; titleOnly: string; descOnly: string; both: string;
    currentTitle: string; kwRecallTitle: string; none: string; output: string;
    rulesTitle: string; rB1: string; rB2: string; rB3: string;
  }> = {
    fr: {
      fieldsTitle: "## CHAMP(S) À PARAPHRASER",
      titleOnly: "title uniquement (le champ `desc` devra être RENVOYÉ INCHANGÉ)",
      descOnly: "desc uniquement (le champ `title` devra être RENVOYÉ INCHANGÉ)",
      both: "title ET desc, les deux, avec reformulation indépendante.",
      currentTitle: "## VALEUR ACTUELLE (source de VÉRITÉ, tout le reste est INTERDIT)",
      kwRecallTitle: "MOTS-CLÉS rappel (seulement pour vérifier ce qui est autorisé) :",
      none: "  (aucun)",
      output: "Sortie : UNIQUEMENT le bloc JSON comme indiqué, rien d'autre.",
      rulesTitle: "## RAPPEL RÈGLES P1..P5 :",
      rB1: "  - même infos factuelles, rien ajouté, rien retiré",
      rB2: "  - formulation 100% différente (pas de simple remplacement 1 mot)",
      rB3: "  - si original parle de « risque », rester au même niveau",
    },
    en: {
      fieldsTitle: "## FIELD(S) TO PARAPHRASE",
      titleOnly: "title only (the `desc` field must be RETURNED UNCHANGED)",
      descOnly: "desc only (the `title` field must be RETURNED UNCHANGED)",
      both: "title AND desc, both, with independent reformulation.",
      currentTitle: "## CURRENT VALUE (source of TRUTH, everything else is FORBIDDEN)",
      kwRecallTitle: "KEYWORDS reminder (only to verify what is allowed):",
      none: "  (none)",
      output: "Output: ONLY the JSON block as indicated, nothing else.",
      rulesTitle: "## RULES REMINDER P1..P5:",
      rB1: "  - same factual info, nothing added, nothing removed",
      rB2: "  - 100% different wording (not just 1-word replacement)",
      rB3: "  - if the original speaks of 'risk', stay at the same level",
    },
    ar: {
      fieldsTitle: "## الحقول المراد إعادة صياغتها",
      titleOnly: "title فقط (الحقل `desc` يجب إرجاعه دون تغيير)",
      descOnly: "desc فقط (الحقل `title` يجب إرجاعه دون تغيير)",
      both: "title و desc معاً، مع إعادة صياغة مستقلة لكل منهما.",
      currentTitle: "## القيمة الحالية (مصدر الحقيقة، كل شيء آخر محرم)",
      kwRecallTitle: "تذكير بالكلمات المفتاحية (للتحقق فقط مما هو مسموح به):",
      none: "  (لا شيء)",
      output: "الإخراج: كتلة JSON فقط كما هو موضح، لا شيء آخر.",
      rulesTitle: "## تذكير بالقواعد P1..P5:",
      rB1: "  - نفس المعلومات الواقعية، لا إضافة، لا حذف",
      rB2: "  - صياغة مختلفة بنسبة 100% (لا مجرد استبدال كلمة واحدة)",
      rB3: "  - إذا تحدث الأصل عن \"خطر\"، فابق على نفس المستوى",
    },
  };
  const ph = PH[lang];

  const fieldSel = field === "title" ? ph.titleOnly : field === "desc" ? ph.descOnly : ph.both;
  const userMsg = [
    ph.fieldsTitle,
    fieldSel,
    "",
    ph.currentTitle,
    `  Title: « ${currentTitle} »`,
    `  Desc:  « ${currentDesc} »`,
    "",
    ph.rulesTitle,
    ph.rB1,
    ph.rB2,
    ph.rB3,
    "",
    ph.kwRecallTitle,
    keywords.length ? keywords.map((k) => `  - ${k}`).join("\n") : ph.none,
    "",
    ph.output,
  ].join("\n");

  let text = "";
  let llmError: string | undefined;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    const r = await ollamaChatRaw(
      [
        { role: "system", content: buildSystemParaphrase(lang) },
        { role: "user", content: userMsg },
      ],
      { temperature: 0.4, signal: ctrl.signal, provider: opts.provider },
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

      // Le périmètre d'une REFORMULATION : le lexique métier ET les mots du
      // texte d'origine — sa source de vérité. Une paraphrase remplace des mots
      // par des synonymes ; exiger qu'elle reprenne les mots-clés à 65 % comme
      // une génération la rejetait presque toujours (mesuré : 0,47). Les
      // nombres, les lieux et les mots interdits restent tenus par ailleurs.
      const lexiconUnionPar = new Set([...getAllLexiconUnion(), ...tokensOf(`${currentTitle} ${currentDesc}`)]);
      const PARAPHRASE_MIN_COVERAGE = 0.5;

      const clean0 = sanitizeDraft({ title, desc }, keywords, fallbackTitle, fallbackDesc, { lexiconWhiteList: lexiconUnionPar, minCoverage: PARAPHRASE_MIN_COVERAGE });
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
            const prefix = tplStr(L.r0_desc_prefix_tpl, { lieu: tPretty });
            const sentencePrep = tplStr(L.r0_desc_sentence_prep, { lieu: tPretty });
            const confirmSentence = tplStr(L.r0_desc_confirm_tpl, { lieu: tPretty });
            if (desc.includes(".")) {
              const firstDot = desc.indexOf(".");
              const s1 = desc.slice(0, firstDot + 1);
              const rest = desc.slice(firstDot + 1).trim();
              desc = rest ? `${s1.slice(0, -1)} ${sentencePrep}. ${rest}` : `${s1.slice(0, -1)} ${sentencePrep}.`;
            } else {
              desc = `${prefix}${desc.charAt(0).toLowerCase() + desc.slice(1)}`;
            }
            if (!normInText(topo, desc)) desc = `${desc}  ${confirmSentence}`;
          }
        }
        title = title.replace(/\s+/g, " ").trim();
        desc = desc.replace(/\s+/g, " ").trim();
      }
      const clean2 = sanitizeDraft({ title, desc }, keywords, fallbackTitle, fallbackDesc, { lexiconWhiteList: lexiconUnionPar, minCoverage: PARAPHRASE_MIN_COVERAGE });
      triggered = triggered || clean2.triggered;
      title = clean2.title; desc = clean2.desc;

      /* ====== S4 paraphrase : même règle qu'à la génération ======
         Une paraphrase change les mots, pas la substance : le nettoyage S1 et
         le rappel des mots-clés suffisent — comparer au gabarit rejetait ici
         toute reformulation honnête. */
      if (title && desc) {
        const recall = keywordRecall(`${title} ${desc}`, keywords);
        if (triggered || recall < MIN_KEYWORD_RECALL_PARAPHRASE) {
          return {
            title: fallbackTitle,
            desc: fallbackDesc,
            fallback: true,
            llmError: llmError ?? (triggered ? "repli paraphrase forcé : nettoyage S1 déclenché" : `repli paraphrase forcé : rappel des mots-clés ${(recall * 100).toFixed(0)} %`),
          };
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
