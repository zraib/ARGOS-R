// ============================================================================
// ARGOS — Affecteur IA Hospinet
// ----------------------------------------------------------------------------
// Tri d'hôpitaux pour une évacuation sanitaire :
//   1. Couche 1 — déterministe : tri par score pondéré
//        · distance Haversine × facteur de détour (voyage)
//        · taux d'occupation global (lits disponibles = capacité résiduelle)
//        · couverture des services médicaux requis (pondérée)
//        · bonus REA disponible / Héli / Ambulances
//   2. Couche 2 — LLM local : justification en langage naturel du top 3
//        · strictement limitée aux chiffres de la Couche 1
//        · interdiction d'inventer faits techniques ou ordres opérationnels
//        · fallback textuel déterministe si Ollama injoignable
// ============================================================================

import type { FieldHospital, Hospital, HospitalServiceKey, Lang } from "@/lib/types";
import { ARGOS_WARD_REFERENCE } from "@/lib/types";
import { resolveHospitalServices } from "@/lib/derive";
import { haversineKm, etaMinutes } from "@/lib/reco";
import { AI_DEFAULT_SETTINGS, AI_ENABLED, resolveProvider } from "@/lib/ai/config";
import { chatComplete } from "@/lib/ai/provider";
import type { ModulesDict } from "@/lib/i18n/modules";
import { tpl } from "@/lib/i18n/format";

export type HospinetIALabels = ModulesDict["hospinet"];

export const DEFAULT_HOSPINET_IA_LABELS: Pick<
  HospinetIALabels,
  | "svc_rea" | "svc_chirurgie" | "svc_medecine" | "svc_urgences" | "svc_pediatrie"
  | "tint_sat" | "tint_tension" | "tint_bonne"
  | "syn_intro_tpl" | "syn_etat_global_tpl" | "syn_reseaux_tpl" | "syn_fieldhosp_tpl" | "syn_busysvcs_tpl" | "syn_flotte_tpl"
  | "aff_fallback_empty_tpl" | "aff_fallback_rank_head" | "aff_fallback_row_tpl" | "aff_fallback_remark_tpl"
  | "axis_voy" | "axis_cap" | "axis_svc" | "bonus_flotte_tpl"
  | "mkpi_eta" | "mkpi_occ" | "mkpi_libres" | "mkpi_svc"
  | "tbl_rank_num" | "tbl_hop"
  | "svc_requis_tpl" | "rangs_4_x_tpl" | "label_score"
  | "kpi_tendus_conf_tpl" | "kpi_confortables" | "kpi_en_tension"
  | "row_lits_tot" | "row_lits_libres_tpl" | "row_rea_tot" | "row_rea_libres"
  | "donnees_aggregees_iris" | "staff_pers_tpl"
> = {
  svc_rea: "Réanimation", svc_chirurgie: "Chirurgie", svc_medecine: "Médecine interne", svc_urgences: "Urgences", svc_pediatrie: "Pédiatrie",
  tint_sat: "saturation élevée", tint_tension: "tension notable", tint_bonne: "bonne tenue",
  syn_intro_tpl: "Le réseau Hospinet compte {totalHospitals} établissements permanents et {totalFieldHospitals} hôpitaux de campagne, pour un total de {lits} lits ({free} disponibles, soit {freePct} %), avec {reaFree} lits de réanimation libres sur {rea}.",
  syn_etat_global_tpl: "État global : {tint} ({pct} % d'occupation). {saturated} établissements sont saturés (≥ 92 %), {tense} en tension (75–91 %), {relaxed} en situation confortable (< 75 %).",
  syn_reseaux_tpl: "Réseau militaire : {mil_hospitals} hôpitaux, {mil_lits} lits, {mil_freePct} % de disponibilité. Réseau civil : {civ_hospitals} hôpitaux, {civ_lits} lits, {civ_freePct} % de disponibilité.",
  syn_fieldhosp_tpl: "{count} hôpitaux de campagne sont déployés, offrant {free} lits libres sur {cap} ({freePct} %).",
  syn_busysvcs_tpl: "Services les plus chargés : {list}.",
  syn_flotte_tpl: "Flotte sanitaire : {amb} ambulances, {heli} hélicoptères médicalisés. Effectif médical total : {staff} personnes.",
  aff_fallback_empty_tpl: "Aucun établissement classé à l'intérieur du périmètre{radius_suffix}. Étendez le rayon, activez les hôpitaux de campagne, ou réduisez les services requis.",
  aff_fallback_rank_head: "Classement déterministe — {name_head}",
  aff_fallback_row_tpl: "· {name} — score {score} · ETA {etaMin} min · {km} km · occ {pctOcc}% · services {svcMatch} · lits libres estimés {estimatedFreeBeds}.",
  aff_fallback_remark_tpl: "Remarque : occupation moyenne des établissements classés = {avgOcc}%{saturated_suffix}.",
  axis_voy: "Voy", axis_cap: "Cap", axis_svc: "Svc", bonus_flotte_tpl: "+{x} bonus flotte",
  mkpi_eta: "ETA", mkpi_occ: "OCC", mkpi_libres: "LIBRES", mkpi_svc: "SVC",
  tbl_rank_num: "#", tbl_hop: "Établissement",
  svc_requis_tpl: "{n} service(s) requis · {list}",
  rangs_4_x_tpl: "Rangs 4 à {last} · {total} au total",
  label_score: "SCORE",
  kpi_tendus_conf_tpl: "{tense} tendus · {relaxed} conf.",
  kpi_confortables: "Confortables", kpi_en_tension: "En tension",
  row_lits_tot: "Lits totaux", row_lits_libres_tpl: "Lits libres ({pct})", row_rea_tot: "Lits REA totaux", row_rea_libres: "REA libres",
  donnees_aggregees_iris: "Données agrégées IRIS",
  staff_pers_tpl: "{n} pers.",
};

export function mergeHospinetIALabels(partial?: Partial<HospinetIALabels>): HospinetIALabels {
  return { ...(DEFAULT_HOSPINET_IA_LABELS as unknown as HospinetIALabels), ...(partial ?? {}) };
}

/* ---------------- Prompt système multi-langue ---------------- */

function buildSystemAffecteur(lang: Lang): string {
  if (lang === "en") {
    return [
      "You are the justification assistant of IRIS's Hospinet Assignor, the military disaster management platform.",
      "Your only role: restate CONCISELY, NEUTRALLY AND STRICTLY factually, IN ENGLISH, the hospital ranking computed by the deterministic Layer-1 engine.",
      "",
      "MANDATORY RULES (NO EXCEPTION):",
      "[I1] NO INVENTION. Every figure, hospital name, distance, ETA, score, occupancy rate, services, bed count, medical fleet comes EXCLUSIVELY from the Layer-1 dataset provided. You add NO information, NO estimate, NO extrapolation.",
      "[I2] NO OPERATIONAL ORDER. You do NOT say: “send”, “evacuate to”, “direct victims”, “activate the plan”, “deploy”, or any instruction, procedure, action recommendation. You ALWAYS express as a NEUTRAL FINDING (e.g. “Hospital X appears at the top of the ranking, with score Y and ETA Z minutes.”).",
      "[I3] NO DIAGNOSIS, NO MEDICAL OPINION. You do not assess severity, you do not propose triage, you do not call a service “suitable” if the figure is low. You stick to Layer-1 wording: score, distance, ETA, occupancy, services present.",
      "[I4] NO VAGUE TERMS. Forbidden: “probably”, “seems”, “maybe”, “surely”, “ideally”, “to be preferred”, “recommended”, “best choice”. Instead: “score X out of 100”, “occupancy rate Y %”, “ETA Z min”.",
      "[I5] MANDATORY STRUCTURE (nothing else, no preamble):",
      "     1. One synthesis sentence on the overall ranking (name of #1, score, ETA, km).",
      "     2. Top 3: each hospital = 2 short lines, with the KEY FIGURES of Layer 1.",
      "     3. A single final remark: residual network capacity, saturation, or uncovered radius if needed. EXACTLY ONE REMARK, no closing conclusion.",
      "[I6] Every cited figure is IDENTICAL to the one transmitted. If a figure is absent → you do not mention it.",
      "[I7] STEP OUT OF JSON. Do NOT produce any ```json block, NO Markdown table, NO bullet list with dashes (allowed: line breaks between the 3 sections).",
      "",
      "Write ENTIRELY in English.",
    ].join("\n");
  }
  if (lang === "ar") {
    return [
      "أنت مساعد التبرير لمصنّف Hospinet التابع لمنصة IRIS العسكرية لإدارة الكوارث.",
      "دورك الوحيد : أن تعيد صياغة تصنيف المستشفيات المحسوب بواسطة المحرك الحتمي للطبقة الأولى، باختصار وبحيادية وحيادية وبشكل وقائعي صارم، باللغة العربية.",
      "",
      "قواعد إلزامية (بدون استثناء):",
      "[I1] لا اختراع. كل الأرقام، وأسماء المستشفيات، والمسافات، وزمن الوصول، والنقاط، ونسبة الإشغال، والخدمات، وعدد الأسرة، والأسطول الصحي تأتي حصريًا من مجموعة بيانات الطبقة الأولى المقدمة. لا تضيف أي معلومة ولا تقدير ولا استقراء.",
      "[I2] لا أمر عملياتي. لا تقول : « أرسل »، « أزل إلى »، « وجه الضحايا »، « فعّل الخطة »، « انشر »، ولا أي تعليمة أو إجراء أو توصية بعمل. تعبر دائمًا على شكل ملاحظة محايدة (مثل : « يظهر المستشفى X في صدارة التصنيف، بنقاط Y وزمن وصول Z دقيقة. »).",
      "[I3] لا تشخيص ولا رأي طبي. لا تقيّم الخطورة، ولا تقترح فرزًا، ولا تصف خدمة بـ « مناسبة » إذا كان الرقم منخفضًا. تلتزم بمصطلحات الطبقة الأولى : نقاط، مسافة، زمن وصول، إشغال، خدمات موجودة.",
      "[I4] لا مصطلحات غامضة. ممنوع : « ربما »، « يبدو »، « على الأرجح »، « مثاليًا »، « يُفضّل »، « موصى به »، « أفضل خيار ». بدلًا من ذلك : « نقاط X من 100 »، « نسبة إشغال Y % »، « زمن الوصول Z د ».",
      "[I5] هيكل إلزامي (لا شيء غيره، لا مقدمة):",
      "     1. جملة تلخيصية حول التصنيف العام (اسم الأول، والنقاط، وزمن الوصول، وكم).",
      "     2. أفضل 3 : كل مستشفى = سطران قصيران، مع الأرقام الرئيسية للطبقة الأولى.",
      "     3. ملاحظة أخيرة واحدة فقط : القدرة الاستيعابية المتبقية للشبكة، أو الإشباع، أو نصف القطر غير المشمول إذا لزم الأمر. ملاحظة واحدة فقط لا خاتمة.",
      "[I6] كل رقم مذكور مطابق تمامًا لما أُرسل. إذا كان الرقم غائبًا → لا تذكره.",
      "[I7] أخرج من JSON. لا تنتج أي كتلة ```json، ولا جدول Markdown، ولا قائمة نقطية بشرطات (يسمح بفواصل الأسطر بين الأقسام الثلاثة).",
      "",
      "اكتب باللغة العربية بالكامل.",
    ].join("\n");
  }
  return [
    "Tu es l'assistant de justification de l'Affecteur Hospinet d'IRIS, plateforme militaire de gestion des catastrophes.",
    "Ton unique rôle : reformuler EN FRANÇAIS CONCIS, NEUTRE ET STRICTEMENT factuel, le classement des hôpitaux calculé par le moteur déterministe de la Couche 1.",
    "",
    "RÈGLES IMPÉRATIVES (SANS EXCEPTION) :",
    "[I1] AUCUNE INVENTION. Tous les chiffres, noms d'hôpitaux, distances, ETA, scores, taux d'occupation, services, nombres de lits, flotte sanitaire viennent EXCLUSIVEMENT du jeu de données Couche 1 fourni. Tu n'ajoutes AUCUNE information, AUCUNE estimation, AUCUNE extrapolation.",
    "[I2] AUCUN ORDRE OPÉRATIONNEL. Tu ne dis PAS : « envoyer », « évacuer vers », « diriger les victimes », « activer le plan », « déployer », ni aucune consigne, procédure, recommandation d'action. Tu exprime TOUJOURS sous forme de CONSTAT NEUTRE (ex : « L'hôpital X apparaît en tête du classement, avec score Y et ETA Z minutes. »).",
    "[I3] PAS DE DIAGNOSTIC, PAS D'AVIS MÉDICAL. Tu ne juges pas la gravité, tu ne proposes pas de triage, tu ne dis pas qu'un service est « adapté » si le chiffre est faible. Tu restes sur les mots de Couche 1 : score, distance, ETA, occupation, services présents.",
    "[I4] PAS DE TERMES IMPRÉCIS. Interdits : « probablement », « semble », « peut-être », « sûrement », « idéalement », « à privilégier », « recommandé », « meilleur choix ». Au lieu de ça : « score X sur 100 », « taux d'occupation Y % », « ETA Z min ».",
    "[I5] STRUCTURE OBLIGATOIRE (rien d'autre, pas de préambule) :",
    "     1. Une phrase de synthèse sur le classement global (nom du top 1, score, ETA, km).",
    "     2. Top 3 : chaque hôpital = 2 lignes courtes, avec les CHIFFRES CLÉS de Couche 1.",
    "     3. Une remarque finale unique : capacité résiduelle réseau, saturation, ou rayon non couvert si besoin. SOIT UNE SEULE REMARQUE, PAS DE CONCLUSION.",
    "[I6] Chaque chiffre cité est IDENTIQUE à celui transmis. Si un chiffre est absent → tu ne le mentionnes pas.",
    "[I7] SORS DU JSON. Ne produit AUCUN bloc ```json, AUCUN tableau Markdown, AUCUNE liste à puces avec tirets (autorisé : sauts de ligne entre les 3 sections).",
  ].join("\n");
}

/* ---------------- Types publics ---------------- */

export interface AffecteurNeed {
  /** Coordonnées [lng, lat] du point d'évacuation (ex : site incident) */
  ll: [number, number] | null;
  /** Nom libre du point (ex : « Épicentre Al Haouz ») — utilisé dans le texte */
  label?: string;
  /** Nombre total de victimes/patients à répartir */
  victims: number;
  /** Services médicaux requis (clés du référentiel ARGOS_WARD_REFERENCE) */
  services: HospitalServiceKey[];
  /** Poids des 3 axes — somme normalisée en interne (pas d'entrée utilisateur) */
  weights?: { travel?: number; capacity?: number; service?: number };
  /** Rayon de recherche en km (0 = pas de filtre dur) */
  radiusKm?: number;
  /** Inclure les hôpitaux de campagne dans le classement ? */
  includeFieldHosps?: boolean;
}

export interface AffecteurRow {
  /** Hôpital classé (toujours le vrai Hospital pour affichage) */
  hospital: Hospital | FieldHospital;
  /** true = hôpital de campagne */
  field: boolean;
  /** Rang 1-indexé dans le classement */
  rank: number;
  /** Score 0..100 */
  score: number;
  /** Distance route (vol oiseau × 1.3) km */
  km: number;
  /** Temps d'acheminement estimé min */
  etaMin: number;
  /** Capacité résiduelle estimée (lits libérables) */
  estimatedFreeBeds: number;
  /** Taux d'occupation global */
  pctOcc: number;
  /** Sur les services demandés : [nbre présents avec lits libres, nbre total demandés] */
  svcMatch: [number, number];
  /** Détail par service requis (statut / lits libres) — ordre identique need.services */
  svcDetail: { key: HospitalServiceKey; name: string; free: number; present: boolean }[];
  /** Décomposition 0..100 du score pour mini-barres */
  breakdown: { travel: number; capacity: number; service: number; bonus: number };
}

export interface AffecteurResult {
  rows: AffecteurRow[];
  /** true = aucun hôpital à l'intérieur du rayon */
  empty: boolean;
  /** Justification globale + top 3, null avant appel LLM */
  justification?: string;
  fallback?: boolean;
  llmError?: string;
}

/* ---------------- Paramètres Couche 1 ---------------- */

const DEFAULT_WEIGHTS = { travel: 0.35, capacity: 0.3, service: 0.35 };

const SERVICE_WEIGHT_BONUS: Record<string, number> = {
  rea: 3.0, urgences: 1.8, chirurgie: 1.4, medecine: 1.1,
  pediatrie: 1.1, cardio: 1.3, pneumo: 1.1, neuro: 1.3, orthopedie: 1.2,
};
const AMB_BONUS = 1.5;    // pts / ambulance
const HELI_BONUS = 2.2;   // pts / hélicoptère
const OCC_OPTIMAL = 60;   // taux d'occupation idéal
const OCC_HARD_MAX = 96;  // exclusion dure

/* ---------------- COUCHE 1 — Tri déterministe ---------------- */

function round(n: number, p = 1) {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function serviceName(key: HospitalServiceKey): string {
  return ARGOS_WARD_REFERENCE.find((r) => r.key === key)?.label ?? String(key);
}

export function rankHospitals(
  need: AffecteurNeed,
  hospitals: Hospital[],
  fieldHosps: FieldHospital[] = [],
): AffecteurResult {
  const radius = need.radiusKm && need.radiusKm > 0 ? need.radiusKm : Infinity;
  const raw = need.weights ?? DEFAULT_WEIGHTS;
  const sum = (raw.travel ?? 0) + (raw.capacity ?? 0) + (raw.service ?? 0) || 1;
  const w = {
    travel: (raw.travel ?? DEFAULT_WEIGHTS.travel) / sum,
    capacity: (raw.capacity ?? DEFAULT_WEIGHTS.capacity) / sum,
    service: (raw.service ?? DEFAULT_WEIGHTS.service) / sum,
  };

  const required = need.services?.length ? need.services : (["rea", "urgences"] as HospitalServiceKey[]);
  const origin = need.ll ?? [0, 0];

  // Préparation pool : hôpitaux fixes + optionnellement hôpitaux de campagne.
  type PoolItem = { h: Hospital | FieldHospital; field: boolean };
  const pool: PoolItem[] = [];
  for (const h of hospitals) pool.push({ h, field: false });
  if (need.includeFieldHosps) for (const f of fieldHosps) pool.push({ h: f, field: true });

  const rows: AffecteurRow[] = [];

  for (const item of pool) {
    const { h, field } = item;

    // Champs normalisés (hôpital fixe vs campagne)
    const hll = h.ll ?? [0, 0];
    const km = haversineKm(origin, hll);
    if (km > radius) continue;

    let litsTotal = field ? (h as FieldHospital).cap : (h as Hospital).lits;
    let litsOcc = field ? (h as FieldHospital).occ : (h as Hospital).occ;
    if (litsTotal <= 0) litsTotal = 1;
    if (litsOcc < 0) litsOcc = 0;
    if (litsOcc > litsTotal) litsOcc = litsTotal;
    const pctOcc = round((100 * litsOcc) / litsTotal, 0);
    const free = litsTotal - litsOcc;

    if (pctOcc >= OCC_HARD_MAX) continue; // exclusion dure : saturation critique

    const eta = etaMinutes(origin, hll);

    // ---- Score axis 1 : VOYAGE ----
    const travel = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.min(eta, 240) / 240))));

    // ---- Score axis 2 : CAPACITÉ ----
    // Cloche centrée sur OCC_OPTIMAL : un hôpital à 60% est le plus
    // approprié (peu de risque, reste de la marge). Trop vide = suspect
    // (petite structure), trop plein = à éviter.
    const d = Math.abs(pctOcc - OCC_OPTIMAL);
    const capacity = Math.max(0, Math.round(100 * (1 - d / 45)));

    // ---- Score axis 3 : ADÉQUATION SERVICES REQUIS ----
    // Pour chaque service demandé : bonus = min(litsLibres, 6) × poids.
    // Service absent → 0. Le score service est (somme / sum_poids) * 100
    // tronqué à 100. On garde aussi le détail pour affichage UI.
    const resolved = field ? [] : resolveHospitalServices(h as Hospital);
    let svcPts = 0;
    let denom = 0;
    const svcDetail: AffecteurRow["svcDetail"] = [];
    let svcPresentCount = 0;

    for (const key of required) {
      const sw = SERVICE_WEIGHT_BONUS[key] ?? 1;
      denom += sw;
      if (field) {
        const hasAny = true; // campagne = multi-service générique
        const estFree = Math.max(0, (h as FieldHospital).cap - (h as FieldHospital).occ);
        const freeVal = Math.min(estFree, 8);
        const pts = Math.min(sw * freeVal * 5, 100 * sw);
        svcPts += pts;
        svcPresentCount += 1;
        svcDetail.push({ key, name: serviceName(key), free: estFree, present: hasAny });
      } else {
        const entry = resolved.find((r) => r.key === key);
        const present = !!entry && entry.free > 0;
        const freeVal = entry?.free ?? 0;
        const pts = present ? Math.min(sw * Math.min(freeVal, 10) * 4.5, 100 * sw) : 0;
        svcPts += pts;
        if (present) svcPresentCount += 1;
        svcDetail.push({ key, name: serviceName(key), free: freeVal, present });
      }
    }
    const service = denom > 0 ? Math.max(0, Math.min(100, Math.round((svcPts / denom) * 1))) : 0;

    // ---- Bonus : flotte sanitaire ----
    const amb = field ? 0 : (h as Hospital).amb ?? 0;
    const heli = field ? 0 : (h as Hospital).heli ?? 0;
    const bonus = Math.min(20, Math.round(AMB_BONUS * amb + HELI_BONUS * heli));

    const score = Math.max(0, Math.min(100,
      Math.round(w.travel * travel + w.capacity * capacity + w.service * service + bonus / 5),
    ));

    const estFreeBeds = field
      ? Math.max(0, (h as FieldHospital).cap - (h as FieldHospital).occ)
      : free + (Math.max(0, OCC_HARD_MAX - pctOcc) * (h as Hospital).rea) / 200;

    rows.push({
      hospital: h,
      field,
      rank: 0,
      score,
      km: round(km, 1),
      etaMin: eta,
      estimatedFreeBeds: Math.round(estFreeBeds),
      pctOcc,
      svcMatch: [svcPresentCount, required.length],
      svcDetail,
      breakdown: { travel, capacity, service, bonus },
    });
  }

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => (r.rank = i + 1));

  return { rows, empty: rows.length === 0 };
}

/* ---------------- COUCHE 2 — LLM Justification ---------------- */

/** Construit le prompt utilisateur à partir des FAITS DÉTERMINISTES SEULEMENT. */
function buildUserPrompt(
  need: AffecteurNeed,
  res: AffecteurResult,
  lang: Lang = "fr",
  L: HospinetIALabels = mergeHospinetIALabels(),
): string {
  const ctxHeader = lang === "en" ? "# OPERATIONAL CONTEXT" : lang === "ar" ? "# السياق العملياتي" : "# CONTEXTE OPÉRATIONNEL";
  const ctxEvac = lang === "en" ? "Evacuation point" : lang === "ar" ? "نقطة الإخلاء" : "Point d'évacuation";
  const ctxUnnamed = lang === "en" ? "unnamed" : lang === "ar" ? "بدون اسم" : "non nommé";
  const ctxVictims = lang === "en" ? "Estimated victims" : lang === "ar" ? "الضحايا المقدرون" : "Victimes estimées";
  const ctxServices = lang === "en" ? "Required services" : lang === "ar" ? "الخدمات المطلوبة" : "Services requis";
  const ctxServicesDefault = lang === "en" ? "intensive care · emergency (default)" : lang === "ar" ? "الإنعاش · الطوارئ (افتراضي)" : "réanimation · urgences (par défaut)";
  const ctxField = lang === "en" ? "Includes field hospitals" : lang === "ar" ? "يشمل المستشفيات الميدانية" : "Inclut hôpitaux de campagne";
  const ctxYes = lang === "en" ? "yes" : lang === "ar" ? "نعم" : "oui";
  const ctxNo = lang === "en" ? "no" : lang === "ar" ? "لا" : "non";
  const ctxRadius = lang === "en" ? "Radius" : lang === "ar" ? "نصف القطر" : "Rayon";
  const classHeader = lang === "en" ? "# LAYER-1 CLASSIFICATION (deterministic, ground truth)" : lang === "ar" ? "# تصنيف الطبقة الأولى (حتمي، مصدر الحقيقة)" : "# CLASSIFICATION COUCHE 1 (déterministe, source de vérité)";
  const classWeights = lang === "en" ? "Weights" : lang === "ar" ? "الأوزان" : "Poids";
  const classTravel = lang === "en" ? "travel" : lang === "ar" ? "الوصول" : "voyage";
  const classCapacity = lang === "en" ? "capacity" : lang === "ar" ? "السعة" : "capacité";
  const classServices = lang === "en" ? "services" : lang === "ar" ? "الخدمات" : "services";
  const classCount = lang === "en" ? "Ranked hospitals" : lang === "ar" ? "المستشفيات المصنّفة" : "Nombre d'hôpitaux classés";
  const hopRankHeader = lang === "en" ? "HOSPITAL" : lang === "ar" ? "المستشفى" : "HOPITAL";
  const hScore = lang === "en" ? "Score" : lang === "ar" ? "النقاط" : "Score";
  const hBreakdown = lang === "en" ? "breakdown" : lang === "ar" ? "التفصيل" : "décomposition";
  const hBonusFleet = lang === "en" ? "fleet bonus" : lang === "ar" ? "مكافأة الأسطول" : "bonus flotte";
  const hDist = lang === "en" ? "Distance" : lang === "ar" ? "المسافة" : "Distance";
  const hEta = lang === "en" ? "estimated ETA" : lang === "ar" ? "زمن الوصول المقدر" : "ETA estimé";
  const hOcc = lang === "en" ? "Overall occupancy" : lang === "ar" ? "الإشغال العام" : "Taux d'occupation global";
  const hFreeEst = lang === "en" ? "Estimated free beds" : lang === "ar" ? "الأسرّة المتاحة تقديريًا" : "Lits libres estimés";
  const hSvcCov = lang === "en" ? "Required services coverage" : lang === "ar" ? "تغطية الخدمات المطلوبة" : "Couverture services requis";
  const hSvcDetail = lang === "en" ? "detail" : lang === "ar" ? "التفصيل" : "détail";
  const hSvcFree = lang === "en" ? "free" : lang === "ar" ? "متاح" : "libres";
  const hSvcAbsent = lang === "en" ? "absent" : lang === "ar" ? "غائب" : "absent";
  const hFleet = lang === "en" ? "Medical fleet" : lang === "ar" ? "الأسطول الصحي" : "Flotte sanitaire";
  const hStaff = lang === "en" ? "staff" : lang === "ar" ? "الشخص" : "personnel";
  const instrHeader = lang === "en" ? "# RESPONSE INSTRUCTION" : lang === "ar" ? "# تعليمات الرد" : "# INSTRUCTION DE RÉPONSE";
  const instr1 = lang === "en"
    ? "Formulate your justification STRICTLY within structure [I5]: 1 synthesis sentence, then Top 3 (each 2 short lines with KEY FIGURES), then 1 single final remark."
    : lang === "ar"
      ? "صيغ تبريرك بدقة ضمن الهيكل [I5] : جملة تلخيصية واحدة، ثم أفضل 3 (كل منهما بسطرين قصيرين مع الأرقام الرئيسية)، ثم ملاحظة أخيرة واحدة فقط."
      : "Formule ta justification STRICTEMENT dans la structure [I5] : 1 phrase synthèse, puis Top 3 (chacun 2 lignes courtes avec CHIFFRES CLÉS), puis 1 remarque finale unique.";
  const instr2 = lang === "en"
    ? "REMINDER [I2]: NO recommendation/operation/order, ONLY NEUTRAL FINDINGS based on this dataset."
    : lang === "ar"
      ? "تذكير [I2] : لا توصية ولا عملية ولا أمر، فقط ملاحظات محايدة تستند على مجموعة البيانات هذه."
      : "RAPPEL [I2] : AUCUNE recommandation/opération/ordre, SEULEMENT des CONSTATS NEUTRES basés sur ce jeu de données.";

  const head: string[] = [];
  head.push(ctxHeader);
  head.push(`- ${ctxEvac} : ${need.label ?? ctxUnnamed} (coord ${(need.ll ?? [0, 0]).map((v) => round(v, 4)).join(", ")})`);
  head.push(`- ${ctxVictims} : ${need.victims}`);
  head.push(`- ${ctxServices} : ${need.services?.length ? need.services.map(serviceName).join(" · ") : ctxServicesDefault}`);
  head.push(`- ${ctxField} : ${need.includeFieldHosps ? ctxYes : ctxNo}`);
  if (need.radiusKm && need.radiusKm > 0) head.push(`- ${ctxRadius} : ${need.radiusKm} km`);
  head.push("");
  head.push(classHeader);
  head.push(`- ${classWeights} : ${classTravel} ${round(DEFAULT_WEIGHTS.travel * 100)}%, ${classCapacity} ${round(DEFAULT_WEIGHTS.capacity * 100)}%, ${classServices} ${round(DEFAULT_WEIGHTS.service * 100)}%`);
  head.push(`- ${classCount} : ${res.rows.length}`);
  head.push("");
  const top = res.rows.slice(0, Math.min(5, res.rows.length));
  top.forEach((r) => {
    const hName = r.hospital.nom;
    const ville = "ville" in r.hospital ? r.hospital.ville : "";
    const kind = r.field ? L.field_hospital : ("type" in r.hospital && r.hospital.type ? r.hospital.type : L.hospital);
    head.push(`## ${hopRankHeader} ${r.rank} : ${hName}${ville ? " (" + ville + ")" : ""} — ${kind}`);
    head.push(`- ${hScore} : ${r.score}/100 ; ${hBreakdown} : ${classTravel} ${r.breakdown.travel}, ${classCapacity} ${r.breakdown.capacity}, ${classServices} ${r.breakdown.service}, ${hBonusFleet} ${r.breakdown.bonus}`);
    head.push(`- ${hDist} : ${r.km} km · ${hEta} : ${r.etaMin} min`);
    head.push(`- ${hOcc} : ${r.pctOcc}% · ${hFreeEst} : ${r.estimatedFreeBeds}`);
    head.push(`- ${hSvcCov} : ${r.svcMatch[0]}/${r.svcMatch[1]}` +
      (r.svcDetail.length ? ` ; ${hSvcDetail} : ` + r.svcDetail.map((s) => `${s.name}${s.present ? ` (${s.free} ${hSvcFree})` : ` (${hSvcAbsent})`}`).join(" · ") : ""));
    if (!r.field && "amb" in r.hospital) {
      head.push(`- ${hFleet} : amb ${r.hospital.amb ?? 0} · heli ${r.hospital.heli ?? 0} · ${hStaff} ${r.hospital.staff ?? 0}`);
    }
    head.push("");
  });
  head.push(instrHeader);
  head.push(instr1);
  head.push(instr2);
  return head.join("\n");
}

/* ---- Fallback textuel déterministe (si LLM down) ---- */

export function fallbackJustification(
  need: AffecteurNeed,
  res: AffecteurResult,
  labels?: Partial<HospinetIALabels>,
): string {
  const L = mergeHospinetIALabels(labels);
  if (res.empty) {
    const radiusSuffix = need.radiusKm ? (typeof need.radiusKm === "string" ? need.radiusKm : ` ${need.radiusKm} km`) : "";
    return tpl(L.aff_fallback_empty_tpl, { radius_suffix: radiusSuffix ? ` ${radiusSuffix}` : "" });
  }
  const top = res.rows.slice(0, Math.min(3, res.rows.length));
  const name = (r: AffecteurRow) => `${r.hospital.nom}${"ville" in r.hospital && r.hospital.ville ? ` (${r.hospital.ville})` : ""}`;
  const parts: string[] = [];
  const head = top[0] ? `${name(top[0])} en tête (score ${top[0].score}/100, ETA ${top[0].etaMin} min, ${top[0].km} km).` : "";
  parts.push(tpl(L.aff_fallback_rank_head, { name_head: head }));
  top.forEach((r) => {
    parts.push(tpl(L.aff_fallback_row_tpl, {
      name: name(r),
      score: r.score,
      etaMin: r.etaMin,
      km: r.km,
      pctOcc: r.pctOcc,
      svcMatch: `${r.svcMatch[0]}/${r.svcMatch[1]}`,
      estimatedFreeBeds: r.estimatedFreeBeds,
    }));
  });
  const occs = res.rows.map((r) => r.pctOcc);
  const avgOcc = Math.round(occs.reduce((a, b) => a + b, 0) / Math.max(1, occs.length));
  const saturated = res.rows.filter((r) => r.pctOcc >= 90).length;
  parts.push(tpl(L.aff_fallback_remark_tpl, {
    avgOcc,
    saturated_suffix: saturated ? ` — ${saturated} établissement(s) tendus (≥ 90%)` : "",
  }));
  return parts.join("\n");
}

/* ---- Nettoyage post-LLM : garde-fous anti-dérive ---- */

const AFF_FORBIDDEN: [RegExp, string][] = [
  [/il faut[\s,:]/gi, ""],
  [/vous devriez[\s,:]/gi, ""],
  [/je recommande[\s,:]/gi, ""],
  [/(envoyez|envoyer|dirigez|diriger|evacuez|evacuer|devermine|déterminer|activez|activer|déployer|deployer)[^\n]{0,60}/gi, ""],
  [/(tri|triage|trier|diagnostic|diagnostique|gravité|severite|blessé|blesse|deces|décès)[^\n]{0,50}/gi, ""],
  [/(probablement|peut.?être|peut etre|surement|sûrement|idéalement|idealement|privilégier|privilegier|meilleur choix|à recommander|a recommander)/gi, ""],
];

const AFF_REQUIRED_NUMBERS_MIN = 3;

function sanitizeJustification(text: string, res: AffecteurResult, labels?: Partial<HospinetIALabels>): string {
  let t = text ?? "";
  for (const [re, sub] of AFF_FORBIDDEN) t = t.replace(re, sub);
  t = t.replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");

  const nums = t.match(/\d+/g) ?? [];
  if (nums.length < AFF_REQUIRED_NUMBERS_MIN) {
    return fallbackJustification({ victims: 0, services: [], ll: null }, res, labels);
  }
  return t;
}

/* ---- API publique : justification LLM avec fallback synchrone ---- */

export async function justifyTop3(
  need: AffecteurNeed,
  res: AffecteurResult,
  lang: Lang = "fr",
  labels?: Partial<HospinetIALabels>,
): Promise<{ text: string; fallback: boolean; llmError?: string }> {
  if (!AI_ENABLED) {
    return { text: fallbackJustification(need, res, labels), fallback: true };
  }
  const cfg = resolveProvider(AI_DEFAULT_SETTINGS);
  try {
    const L = mergeHospinetIALabels(labels);
    const user = buildUserPrompt(need, res, lang, L);
    const result = await chatComplete(cfg, [
      { role: "system", content: buildSystemAffecteur(lang) },
      { role: "user", content: user },
    ]);
    if (!result.ok) {
      return { text: fallbackJustification(need, res, labels), fallback: true, llmError: result.error };
    }
    const clean = sanitizeJustification(result.text, res, labels);
    return { text: clean, fallback: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { text: fallbackJustification(need, res, labels), fallback: true, llmError: msg };
  }
}
