// ============================================================================
// lib/ai/copilot/pdf.ts — export PDF minimaliste du Copilot (zéro dépendance).
//
// Implémente un sous-ensemble suffisant de PDF 1.4 pour produire un document
// structuré avec titre, en-tête IRIS, sections (markdown → lignes) +
// tableaux structurés (incidents, hôpitaux, unités, équipements, séismes,
// stats). Police Standard Helvetica (built-in, aucune police embarquée).
//
// Choix délibérés (plateforme sécurisée, pas de dépendances internet) :
//   • Police Type 1 Standard uniquement (Helvetica / Helvetica-Bold).
//   • Compression Flate NON utilisée pour rester 0 dépendance.
//   • Jeu de caractères WinAnsiEncoding : accents latins (FR/ES/DE) supportés
//     via conversion ISO-8859-1 (hors caractères CJK : AR est translittéré
//     silencieusement si présent — la langue d'affichage étant FR par défaut
//     c'est sans incidence sur le flux opérationnel).
// ============================================================================

import type { AiMessage } from "@/lib/store/shared";

// ---------------------------------------------------------------------------
// 1. Mesure — Standard Font Metrics (Helvetica WinAnsi, 1000 upem).
//    On utilise une largeur moyenne par défaut + widths des glyphes les plus
//    fréquents pour une justesse acceptable sans embarquer 256 largeurs.
// ---------------------------------------------------------------------------
const AVG_CHAR_WIDTH_H = 556;
const AVG_CHAR_WIDTH_HB = 600;
const BOLD_W = 1.08;

function charWidth(ch: string, bold: boolean, italic: boolean): number {
  const avg = bold ? AVG_CHAR_WIDTH_HB : AVG_CHAR_WIDTH_H;
  const code = ch.charCodeAt(0);
  if (code === 32) return 278;
  if (code >= 48 && code <= 57) return bold ? 556 : 556; // digits
  if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
    const w = 520 + ((code * 7) % 180);
    return Math.round(bold ? w * BOLD_W : w);
  }
  if (code < 128) return avg;
  return avg;
  void italic;
}

function textWidth(text: string, sizePt: number, bold = false, italic = false): number {
  let total = 0;
  for (let i = 0; i < text.length; i++) total += charWidth(text[i], bold, italic);
  return (total / 1000) * sizePt;
}

// ---------------------------------------------------------------------------
// 2. Conversion caractères → octets WinAnsiEncoding (PDF Latin étendu).
// ---------------------------------------------------------------------------
const WINANSI_MAP: Record<string, number> = {
  "\u20ac": 128, "\u201a": 130, "\u0192": 131, "\u201e": 132,
  "\u2026": 133, "\u2020": 134, "\u2021": 135, "\u02c6": 136,
  "\u2030": 137, "\u0160": 138, "\u2039": 139, "\u0152": 140,
  "\u017d": 142, "\u2018": 145, "\u2019": 146, "\u201c": 147,
  "\u201d": 148, "\u2022": 149, "\u2013": 150, "\u2014": 151,
  "\u02dc": 152, "\u2122": 153, "\u0161": 154, "\u203a": 155,
  "\u0153": 156, "\u017e": 158, "\u0178": 159,
  "\u00c6": 198, "\u00e6": 230,
  "\u00cf": 207, "\u00ef": 239,
  "\u00cb": 203, "\u00eb": 235,
  "\u00dc": 220, "\u00fc": 252,
  "\u00d6": 214, "\u00f6": 246,
  "\u00c4": 196, "\u00e4": 228,
  "\u00ff": 255,
  "\u00ab": 171, "\u00bb": 187,
  "\u2010": 45, "\u2011": 45,
};

// Nettoyage radical des caractères qui deviendraient des points `?` dans WinAnsi,
// ET des codes WinAnsi réservés 128..159 SANS correspondance définie (selon
// visionneuse PDF, ces codes s'affichent en `?` ou sont invisibles).
// Couvre :
//   - U+0000..U+001F  : C0 (sauf \t, \n, \r conservés via pré-nettoyage ligne-par-ligne dans markdown)
//   - U+007F          : DEL
//   - U+0080..U+009F  : C1 (codes réservés WinAnsi : 80/82..8F / 90..9F sauf ceux explicités)
//   - U+00AD          : Soft hyphen
//   - Cf (Format)     : 061C, 034F, 17B4, 17B5, 180B..180D, 180E, 200B..200F, 202A..202E, 2060..206F, FEFF
//   - Zs/Zl/Zp        : espaces Unicode hors U+0020 (pour eviter `?` si non supporté) → remplacé par espace normal
//   - Cs (surrogates) : 2 paires — jetées
const INVISIBLE_OR_BAD_CHARS_RE = new RegExp(
  "[" +
    "\u0000-\u0008" +           // C0 : 00..08
    "\u000B\u000C\u000E-\u001F" + // C0 : 0B,0C, 0E..1F (hors \t=09 \n=0A \r=0D)
    "\u007F" +                  // DEL
    // ================= C1 (U+0080..U+009F) =====================
    // Codes qui ONT un glyphe WinAnsi défini (RFC 1345) : on les laisse passer.
    // Gardés :
    //   0080(€) 0082(‚) 0083(ƒ) 0084(„) 0085(…) 0086(†) 0087(‡) 0088(ˆ) 0089(‰)
    //   008A(Š) 008B(‹) 008C(Œ) 008E(Ž)
    //   0091(‘) 0092(’) 0093(“) 0094(”) 0095(•) 0096(–) 0097(—) 0098(˜) 0099(™)
    //   009A(š) 009B(›) 009C(œ) 009E(ž) 009F(Ÿ)
    // → Codes C1 SANS glyphe → à SUPPRIMER impérativement (sinon ?) :
    //     0081 (HOP)  ·  008D (RI)  ·  008F (SS3)  ·  0090 (DCS)  ·  009D (OSC)
    "\u0081\u008D\u008F\u0090\u009D" +
    // ================ fin C1 =============
    "\u00AD" +                  // soft hyphen
    "\u034F" +                  // combining grapheme joiner
    "\u061C" +                  // arabic letter mark
    "\u17B4\u17B5" +            // khmer vowel inherent
    "\u180B-\u180E" +           // mongolian free vars + vowel sep
    "\u2000-\u200F" +           // 11 espaces + ZWSP/ZWNP/LRM/RLM etc.
    "\u2028\u2029" +            // line / paragraph separator
    "\u202A-\u202E" +           // bidi overrides (LRE/RLE/PDF/LRO/RLO)
    "\u2060-\u206F" +           // word joiner, invisible math ops, VS
    "\uFEFF" +                  // BOM / ZW NBSP
    "\uFFFE\uFFFF" +            // Non-characters (UTF error)
    "]+",
  "g"
);

const ALTERNATE_SPACES_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

function stripInvisibleFormat(s: string): string {
  if (!s) return s;
  // 0. Filtrer les codepoints non rendables en WinAnsi (avant même toute autre transformée) :
  //    • Surrogates isolés U+D800..U+DFFF
  //    • Non-characters BMP U+FFFE / U+FFFF
  //    • Caractères hors BMP entiers (> U+FFFF, i.e. codés en paire de surrogates)
  //    → tous ces cas se transformeraient en `?` dans toWinAnsi → on JETTE.
  const cps = Array.from(s);
  let r = cps.filter(cp => {
    const n = cp.codePointAt(0) ?? 0;
    if (n >= 0xd800 && n <= 0xdfff) return false;   // Surrogates isolés
    if (n === 0xfffe || n === 0xffff) return false; // Non-chars BMP
    if (n > 0x00ffff) return false;                 // Tout caractère hors BMP (emoji, idéogrammes étendus…)
    return true;
  }).join("");
  // 1. Remplacer les espaces alternatifs (non-break, em, en, thin…) par U+0020 classique
  r = r.replace(ALTERNATE_SPACES_RE, " ");
  // 2. Supprimer tous les caractères invisibles / réservés / de formatage.
  r = r.replace(INVISIBLE_OR_BAD_CHARS_RE, "");
  // 3. Collapser les espaces multiples consécutifs (2+ → 1)
  r = r.replace(/[ \t]{2,}/g, " ");
  // 4. Suppression des espaces en tête de ligne (évite les «   Situation » indésirables)
  //    → line-by-line pour préserver les indentations voulues est difficile,
  //      mais dans les SITREP le markdown attend les titres en 1ère position : on trimLeft chaque ligne.
  r = r.replace(/^[ \t]+/gm, "");
  // 5. Normaliser les sauts de ligne : 3+ \n → 2 \n consécutifs max
  r = r.replace(/\n{3,}/g, "\n\n");
  return r;
}

function toWinAnsi(text: string): Uint8Array {
  // Nettoyage préalable : retirer les caractères de formatage invisibles
  // sinon ce sont autant de `?` parasites dans le rendu PDF.
  const cleaned = stripInvisibleFormat(text);
  const out = new Uint8Array(cleaned.length * 2);
  let p = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    let code = c.charCodeAt(0);
    if (code < 128) {
      out[p++] = code;
    } else if (WINANSI_MAP[c] !== undefined) {
      out[p++] = WINANSI_MAP[c];
    } else if (code >= 160 && code <= 255) {
      out[p++] = code;
    } else if (code === 8364) {
      out[p++] = 128;
    } else {
      // caractères hors WinAnsi : translittération SILENCIEUSE (aucun `?` affiché)
      // → on jette le caractère au lieu d'afficher un point d'interrogation laid.
      // Exception : caractères CJK / non latins courants → on garde le ? pour
      // signaler qu'il y a un contenu non rendu, mais on le loggue pas.
      if (code > 0x370) out[p++] = 63;
      // Sinon (contrôle, Latin étendu manquant) : on ignore silencieusement.
    }
  }
  return out.slice(0, p);
}

// Échappe les littéraux PDF dans une string ()
function escapeLiteral(s: Uint8Array): Uint8Array {
  let extra = 0;
  for (let i = 0; i < s.length; i++) {
    const b = s[i];
    if (b === 40 || b === 41 || b === 92) extra++; // ( ) \
    else if (b === 13) extra++;
  }
  if (extra === 0) return s;
  const o = new Uint8Array(s.length + extra);
  let p = 0;
  for (let i = 0; i < s.length; i++) {
    const b = s[i];
    if (b === 40 || b === 41 || b === 92) { o[p++] = 92; o[p++] = b; }
    else if (b === 13) { o[p++] = 92; o[p++] = 114; }
    else o[p++] = b;
  }
  return o;
}

const ENC = new TextEncoder();
function enc(s: string): Uint8Array { return ENC.encode(s); }

// ---------------------------------------------------------------------------
// 3. Construction du document PDF.
// ---------------------------------------------------------------------------
interface PdfFont { id: string; name: string; }
const F_HEL: PdfFont = { id: "F1", name: "Helvetica" };
const F_HB: PdfFont = { id: "F2", name: "Helvetica-Bold" };
const F_HO: PdfFont = { id: "F3", name: "Helvetica-Oblique" };
const F_HBO: PdfFont = { id: "F4", name: "Helvetica-BoldOblique" };

function pickFont(bold: boolean, italic: boolean): PdfFont {
  if (bold && italic) return F_HBO;
  if (bold) return F_HB;
  if (italic) return F_HO;
  return F_HEL;
}

// Format standard A4 (en points PostScript, 72 ppp)
const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 54;
const MARGIN_Y_TOP = 64;
const MARGIN_Y_BOTTOM = 58;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const CONTENT_Y_TOP = PAGE_H - MARGIN_Y_TOP;
const CONTENT_Y_BOTTOM = MARGIN_Y_BOTTOM;

interface PdfTextSpan { text: string; bold?: boolean; italic?: boolean; }
interface PdfTextBlock {
  kind: "text";
  lines: { spans: PdfTextSpan[]; size: number; indent?: number; bullet?: boolean }[];
}
interface PdfHeadingBlock {
  kind: "heading";
  text: string;
  level: 1 | 2 | 3;
}
interface PdfRuleBlock { kind: "rule"; weight: number }
interface PdfTableBlock {
  kind: "table";
  title?: string;
  cols: { label: string; wRatio: number }[];
  rows: (string | number)[][];
}
interface PdfKvBlock {
  kind: "kv";
  title?: string;
  pairs: { label: string; value: string | number }[];
}
type Block = PdfTextBlock | PdfHeadingBlock | PdfRuleBlock | PdfTableBlock | PdfKvBlock;

/**
 * Parse la chaîne en segments (spans) avec styles multiples. Ordre des matchs :
 *   1. `***texte***` → gras + italic
 *   2. `**texte**` → gras
 *   3. `*texte*`   → italic
 * Les délimiteurs non appariés (astérisques orphelins, triples, etc.) sont
 * retirés du texte final (aucun `*` laissé en clair).
 */
function parseInlineMd(text: string): PdfTextSpan[] {
  if (!text) return [];

  // Étape 0 : retirer code inline `…` et triple-bang orphelins courants.
  let t = text.replace(/`([^`]+)`/g, "$1");

  // Étape 1 : tokenizer. On scanne caractère par caractère pour repérer les
  // séquences `***..***`, `**..**`, `*..*`. Les délimiteurs non appariés sont
  // supprimés en fin de parcours.
  const tok: { run: string; bold: boolean; italic: boolean }[] = [];
  const push = (run: string, b: boolean, i: boolean) => {
    if (!run) return;
    const last = tok[tok.length - 1];
    if (last && !!last.bold === !!b && !!last.italic === !!i) last.run += run;
    else tok.push({ run, bold: b, italic: i });
  };

  const n = t.length;
  let i = 0;
  let pBold = false;
  let pItalic = false;
  let buf = "";
  while (i < n) {
    const isStar = t[i] === "*";
    const stars = isStar
      ? (t[i + 1] === "*" ? (t[i + 2] === "*" ? 3 : 2) : 1)
      : 0;
    if (stars === 3) {
      push(buf, pBold, pItalic); buf = "";
      pBold = !pBold; pItalic = !pItalic;
      i += 3;
      continue;
    }
    if (stars === 2) {
      push(buf, pBold, pItalic); buf = "";
      pBold = !pBold;
      i += 2;
      continue;
    }
    if (stars === 1) {
      // Italic seulement si l'astérisque N'EST PAS :
      //   - précédé d'une lettre sans espace (pluriel anglais : items*s*)
      //   - OU suivi immédiat d'un espace/d'une ponctuation forte sans pair
      // → règle simple : on toggle italic dans TOUS les cas ; les étoiles
      // non appariées seront éliminées à la fin par le lexer state machine.
      push(buf, pBold, pItalic); buf = "";
      pItalic = !pItalic;
      i += 1;
      continue;
    }
    buf += t[i++];
  }
  push(buf, pBold, pItalic);

  // Étape 2 : nettoyage final — retirer tous les `*` résiduels isolés
  // (démarqueurs non appariés) qui auraient pu rester dans un run.
  const out: PdfTextSpan[] = [];
  for (const s of tok) {
    const cleaned = s.run.replace(/\*+/g, "");
    if (!cleaned) continue;
    out.push({
      text: cleaned,
      bold: s.bold || undefined,
      italic: s.italic || undefined,
    });
  }
  return out;
}

/**
 * Découpe une liste de spans (mixte normal/bold) en plusieurs lignes pour
 * rentrer dans `widthPt`. Le wrap se fait au niveau des espaces, pas au milieu
 * d'un span si on peut éviter. Retourne une liste de spans par ligne.
 */
function wrapSpans(
  spans: PdfTextSpan[],
  widthPt: number,
  sizePt: number,
): PdfTextSpan[][] {
  if (!spans.length) return [[]];
  const tokens: { text: string; bold: boolean; italic: boolean; isSpace: boolean }[] = [];
  for (const s of spans) {
    const parts = s.text.split(/(\s+)/);
    for (const p of parts) {
      if (!p) continue;
      const isSpace = /^\s+$/.test(p);
      tokens.push({ text: p, bold: !!s.bold, italic: !!s.italic, isSpace });
    }
  }
  const lines: PdfTextSpan[][] = [];
  let line: { text: string; bold: boolean; italic: boolean }[] = [];
  let lineWidth = 0;
  const flush = () => {
    const merged: PdfTextSpan[] = [];
    for (const t of line) {
      const last = merged[merged.length - 1];
      if (last && !!last.bold === !!t.bold && !!last.italic === !!t.italic) {
        last.text += t.text;
      } else {
        merged.push({
          text: t.text,
          bold: t.bold || undefined,
          italic: t.italic || undefined,
        });
      }
    }
    if (merged.length) lines.push(merged);
    line = [];
    lineWidth = 0;
  };
  for (const tok of tokens) {
    const w = textWidth(tok.text, sizePt, !!tok.bold, !!tok.italic);
    if (lineWidth + w > widthPt + 0.5) {
      if (tok.isSpace) {
        flush();
        continue;
      }
      if (!line.length) {
        let hard = tok.text;
        while (textWidth(hard, sizePt, !!tok.bold, !!tok.italic) > widthPt) {
          let cut = hard.length - 1;
          while (cut > 1 && textWidth(hard.slice(0, cut), sizePt, !!tok.bold, !!tok.italic) > widthPt) cut--;
          lines.push([{ text: hard.slice(0, cut), bold: tok.bold || undefined, italic: tok.italic || undefined }]);
          hard = hard.slice(cut);
        }
        if (hard) {
          line.push({ text: hard, bold: !!tok.bold, italic: !!tok.italic });
          lineWidth = textWidth(hard, sizePt, !!tok.bold, !!tok.italic);
        }
        continue;
      }
      flush();
    }
    line.push({ text: tok.text, bold: !!tok.bold, italic: !!tok.italic });
    lineWidth += w;
  }
  if (line.length) flush();
  // Filtre défensif : aucune ligne vide
  return lines.filter(l => l.length > 0);
}

// ---------------------------------------------------------------------------
// 4. Pipeline markdown → Blocks.
// ---------------------------------------------------------------------------
function markdownToBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const lines = markdown.split(/\r?\n/);
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    // —— Parsing ligne par ligne du paragraphe ——
    // Classifie chaque ligne :
    //   - BULLET : si préfixe marqueur PUIS contenu (ou vide → orphelin ignoré)
    //   - HEADING (inline simulé) : si ligne toute seule en MAJUSCULES / pas de contenu après
    // On regroupe les blocs : BULLETs adjacents → bloc text bullet unique, sinon text normal.
    type Classified =
      | { kind: "bullet"; content: string }
      | { kind: "normal"; content: string }
      | { kind: "empty" };
    const bulletOnlyRe = /^\s*([•·\-\u2022\u2013\u2014])\s*$/;          // marqueur orphelin (seul)
    const bulletWithContentRe = /^\s*(?:[•·\-\u2022\u2013\u2014]\s+|\*\s+|\d+[.)]\s+)(.+)$/;
    const classified: Classified[] = [];
    for (const raw of buf) {
      const line = raw.replace(/\s+$/g, "");
      if (!line.trim()) { classified.push({ kind: "empty" }); continue; }
      if (bulletOnlyRe.test(line)) { classified.push({ kind: "empty" }); continue; } // orphelin
      const m = bulletWithContentRe.exec(line);
      if (m) classified.push({ kind: "bullet", content: m[1] });
      else classified.push({ kind: "normal", content: line.trim() });
    }
    // Regroupe en runs contigus de même type (sans compter les empty intercalés entre bullets
    // pour un run continu de bullets)
    type Run = { kind: "bullet" | "normal"; items: string[] };
    const runs: Run[] = [];
    let cur: Run | null = null;
    for (const c of classified) {
      if (c.kind === "empty") continue;
      if (!cur || cur.kind !== c.kind) {
        cur = { kind: c.kind, items: [c.content] };
        runs.push(cur);
      } else {
        cur.items.push(c.content);
      }
    }
    if (!runs.length) {
      // Fallback : texte concaténé si rien n'a été reconnu
      const text = buf.join(" ").trim();
      if (!text) return;
      blocks.push({ kind: "text", lines: [{ spans: parseInlineMd(text), size: 10 }] });
      return;
    }
    for (const run of runs) {
      if (run.kind === "bullet") {
        const items: string[] = [];
        // Accumule le contenu multiligne (ligne NORMAL suivante qui n'est pas un bullet =
        // suite du contenu de l'item précédent).
        for (const it of run.items) {
          const denuded = it.replace(/^[•·\-\*\u2022\u2013\u2014\d.)\s]+/, "").trim();
          if (denuded) items.push(it);
        }
        if (!items.length) continue;
        blocks.push({
          kind: "text",
          lines: items.map(b => ({ spans: parseInlineMd(b), size: 10, bullet: true })),
        });
      } else {
        // Normal : sépare « heading implicite L2 » (courte, sans 2-points, débute par majuscule)
        // des lignes de KPI / texte libre multiligne qui restent en text.size=10.
        const items = run.items.map(s => s.trim()).filter(Boolean);
        if (!items.length) continue;
        // Est-ce une ligne KPI / label : valeur ?
        const looksLikeKpiLine = (ln: string) => /[:：]\s*\S/.test(ln) || /^\s*\d+\s*%?\s*$/.test(ln);
        // Éclate la run en sous-groupes : [heading éventuel + lignes KPIs/text suivants]
        const subgroups: Array<{ heading?: string; lines: string[] }> = [];
        let cur: { heading?: string; lines: string[] } = { lines: [] };
        for (const it of items) {
          const isHeadLike =
            !looksLikeKpiLine(it) &&
            it.length <= 40 &&
            /^[A-ZÀÂÄÈÉÊËÎÏÔÖÙÛÜÇ0-9]/.test(it) &&
            !/\.$/.test(it);
          if (isHeadLike) {
            if (cur.heading || cur.lines.length) subgroups.push(cur);
            cur = { heading: it, lines: [] };
          } else {
            cur.lines.push(it);
          }
        }
        if (cur.heading || cur.lines.length) subgroups.push(cur);
        for (const g of subgroups) {
          if (g.heading) blocks.push({ kind: "heading", text: g.heading, level: 2 });
          if (g.lines.length) {
            blocks.push({
              kind: "text",
              lines: g.lines.map(t => ({ spans: parseInlineMd(t), size: 10 })),
            });
          }
        }
      }
    }
  };

  // Retire aussi `NIVEAU 2 · VIGILANCE` en gras Markdown, et nettoie les `**`
  // autour des labels de recommandations / niveaux.
  const cleanInlineMarkup = (s: string) => s
    .replace(/\*\*(NIVEAU\s+\d[^\n*]{0,120})\*\*/g, "$1")
    .replace(/\*\*(GRAVITÉ\s+(HAUTE|MODÉRÉE|FAIBLE))\*\*/g, "$1");

  let paraBuf: string[] = [];
  while (i < lines.length) {
    const raw = lines[i];
    const line = cleanInlineMarkup(raw.replace(/\s+$/g, ""));

    if (!line.trim()) { flushParagraph(paraBuf); paraBuf = []; i++; continue; }

    const h1 = line.match(/^#\s+(.+?)\s*#?$/);
    const h2 = h1 ? null : line.match(/^##\s+(.+?)\s*#?$/);
    const h3 = h1 || h2 ? null : line.match(/^###\s+(.+?)\s*#?$/);
    if (h1 || h2 || h3) {
      flushParagraph(paraBuf); paraBuf = [];
      const text = (h1 ?? h2 ?? h3)![1].trim();
      const level = (h1 ? 1 : h2 ? 2 : 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", text, level });
      i++; continue;
    }
    const hr = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
    if (hr) {
      flushParagraph(paraBuf); paraBuf = [];
      blocks.push({ kind: "rule", weight: 0.6 });
      i++; continue;
    }
    // Tableau markdown : ligne commençant par | ou contenant deux | au moins,
    // et ligne suivante de formatage |---|---| (ou plus).
    const startsTable =
      /^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length &&
      /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(lines[i + 1]);
    if (startsTable) {
      flushParagraph(paraBuf); paraBuf = [];
      const headerCells = line.slice(line.indexOf("|") + 1, line.lastIndexOf("|")).split("|").map(c => c.trim());
      i += 2; // skip header + separator lines
      const tableRows: (string | number)[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const row = lines[i];
        const cells = row.slice(row.indexOf("|") + 1, row.lastIndexOf("|")).split("|").map(c => c.trim());
        tableRows.push(cells);
        i++;
      }
      const cols = headerCells.map(label => ({ label, wRatio: 1 }));
      if (cols.length) {
        // Pondérations basées sur largeur moyenne estimée.
        const widths = cols.map((_, idx) => {
          let maxW = textWidth(headerCells[idx] ?? "", 10, true);
          for (const r of tableRows) {
            const cell = String(r[idx] ?? "");
            const w = textWidth(cell, 10);
            if (w > maxW) maxW = w;
          }
          return Math.max(60, maxW + 18);
        });
        const total = widths.reduce((a, b) => a + b, 0);
        cols.forEach((c, idx) => { c.wRatio = widths[idx] / total; });
      }
      blocks.push({ kind: "table", cols, rows: tableRows });
      continue;
    }
    // Ligne avec préfixe de liste déjà pris en compte dans paragraph wrap.
    paraBuf.push(line);
    i++;
  }
  flushParagraph(paraBuf);
  return blocks;
}

// ---------------------------------------------------------------------------
// 5. Mise en pages — rend Blocks → ContentStreams (par page) avec pagination.
// ---------------------------------------------------------------------------

function buildPages(docBlocks: Block[]): Uint8Array[] {
  // Chaque page = liste d'opérateurs PDF, on concatène ensuite en un Uint8Array unique/page
  const pagesBuffers: Uint8Array[][] = [];
  let current: Uint8Array[] = [];
  const pushOp = (op: Uint8Array) => current.push(op);

  let yCursor = CONTENT_Y_TOP;

  const ensureSpace = (needPt: number): boolean => {
    if (yCursor - needPt >= CONTENT_Y_BOTTOM) return true;
    // Saut de page
    if (current.length) pagesBuffers.push(current);
    current = [];
    yCursor = CONTENT_Y_TOP;
    return true;
  };
  // Pousse une ligne de texte en mode BT ... ET. Retourne le y suivant (cursor).
  const writeTextLine = (text: string, size: number, bold: boolean, italic: boolean, xPt: number, yPt: number) => {
    const font = pickFont(bold, italic);
    const bytes = escapeLiteral(toWinAnsi(text));
    const header = enc(`BT\n/${font.id} ${size} Tf\n1 0 0 1 ${xPt.toFixed(2)} ${yPt.toFixed(2)} Tm\n(`);
    const tail = enc(`) Tj\nET\n`);
    const buf = new Uint8Array(header.length + bytes.length + tail.length);
    buf.set(header, 0);
    buf.set(bytes, header.length);
    buf.set(tail, header.length + bytes.length);
    pushOp(buf);
  };
  // Écrit une ligne composée de plusieurs spans (mixte styles) en avançant le curseur.
  const writeSpansLine = (spans: PdfTextSpan[], size: number, xPt: number, yPt: number) => {
    if (!spans.length) return;
    const ops: Uint8Array[] = [];
    ops.push(enc("BT\n"));
    let x = xPt;
    let currentFont = "";
    for (const sp of spans) {
      if (!sp.text) continue;
      const font = pickFont(!!sp.bold, !!sp.italic);
      if (font.id !== currentFont) {
        ops.push(enc(`/${font.id} ${size} Tf\n`));
        currentFont = font.id;
      }
      ops.push(enc(`1 0 0 1 ${x.toFixed(2)} ${yPt.toFixed(2)} Tm\n(`));
      ops.push(escapeLiteral(toWinAnsi(sp.text)));
      ops.push(enc(") Tj\n"));
      x += textWidth(sp.text, size, !!sp.bold, !!sp.italic);
    }
    ops.push(enc("ET\n"));
    // Concaténation optimisée :
    let len = 0;
    for (const o of ops) len += o.length;
    const buf = new Uint8Array(len);
    let p = 0;
    for (const o of ops) { buf.set(o, p); p += o.length; }
    pushOp(buf);
  };
  const writeRule = (y: number, thickness = 0.4) => {
    pushOp(enc(`${thickness} w\n${MARGIN_X} ${y.toFixed(2)} m\n${(PAGE_W - MARGIN_X).toFixed(2)} ${y.toFixed(2)} l\nS\n`));
  };

  const lineHeightFor = (size: number) => Math.round(size * 1.4);

  for (const block of docBlocks) {
    if (block.kind === "rule") {
      ensureSpace(6);
      yCursor -= 4;
      writeRule(yCursor, block.weight ?? 0.5);
      yCursor -= 6;
      continue;
    }

    if (block.kind === "heading") {
      const sizes = { 1: 20, 2: 14, 3: 12 } as const;
      const size = sizes[block.level];
      const gapBefore = block.level === 1 ? 24 : 14;
      ensureSpace(gapBefore + lineHeightFor(size));
      yCursor -= gapBefore;
      // Titres de niveau 1 en ALL CAPS style ORSEC.
      const text = block.level === 1 ? block.text.toUpperCase() : block.text;
      writeTextLine(text, size, true, false, MARGIN_X, yCursor - size);
      yCursor -= lineHeightFor(size);
      if (block.level === 1) {
        yCursor -= 2;
        writeRule(yCursor, 1.0);
        // Sous-règle plus fine 2 pt en dessous pour l'esthétique.
        yCursor -= 3;
        writeRule(yCursor, 0.4);
        yCursor -= 10;
      } else if (block.level === 2) {
        yCursor -= 2;
        writeRule(yCursor, 0.4);
        yCursor -= 4;
      }
      continue;
    }

    if (block.kind === "text") {
      const gapBefore = 6;
      let firstLine = true;
      for (const ln of block.lines) {
        const size = ln.size ?? 10;
        const indentPt = (ln.indent ?? 0) * 10 + (ln.bullet ? 14 : 0);
        const width = CONTENT_W - indentPt;
        const rawSpans: PdfTextSpan[] = (ln.spans && ln.spans.length) ? ln.spans : [];
        // Ignore les lignes qui n'ont AUCUN contenu (spans vides / juste des espaces)
        const hasContent = rawSpans.some(s => s.text && s.text.trim().length > 0);
        if (!hasContent) continue;
        const wrappedLinesSpans = wrapSpans(rawSpans, width, size);
        if (!wrappedLinesSpans.length) continue;
        const needTotal = (firstLine ? gapBefore : 0) + wrappedLinesSpans.length * lineHeightFor(size);
        ensureSpace(needTotal);
        if (firstLine) { yCursor -= gapBefore; firstLine = false; }
        let bulletDrawn = false;
        for (const wSpans of wrappedLinesSpans) {
          if (!wSpans.length) continue;
          ensureSpace(lineHeightFor(size));
          writeSpansLine(wSpans, size, MARGIN_X + indentPt, yCursor - size);
          if (ln.bullet && !bulletDrawn) {
            const glyph = "•";
            const sz = size;
            const g = escapeLiteral(toWinAnsi(glyph));
            const bts = enc(`BT\n/${F_HEL.id} ${sz} Tf\n1 0 0 1 ${(MARGIN_X + 2).toFixed(2)} ${(yCursor - sz + 1).toFixed(2)} Tm\n(`);
            const tailG = enc(`) Tj\nET\n`);
            const lineBuf = new Uint8Array(bts.length + g.length + tailG.length);
            lineBuf.set(bts, 0); lineBuf.set(g, bts.length); lineBuf.set(tailG, bts.length + g.length);
            pushOp(lineBuf);
            bulletDrawn = true;
          }
          yCursor -= lineHeightFor(size);
        }
      }
      continue;
    }

    if (block.kind === "kv") {
      const size = 10;
      if (block.title) {
        ensureSpace(lineHeightFor(12) + 6);
        yCursor -= 4;
        writeTextLine(block.title, 12, true, false, MARGIN_X, yCursor - 12);
        yCursor -= lineHeightFor(12);
      }
      for (const { label, value } of block.pairs) {
        ensureSpace(lineHeightFor(size));
        const labelStr = `${label} :`;
        writeTextLine(labelStr, size, true, false, MARGIN_X + 6, yCursor - size);
        // Alignement de la valeur après le label.
        const labelW = textWidth(labelStr, size, true);
        const valX = Math.min(PAGE_W - MARGIN_X - 6, MARGIN_X + 6 + labelW + 10);
        const valSpan: PdfTextSpan[] = parseInlineMd(String(value));
        const valLines = wrapSpans(valSpan, Math.max(80, PAGE_W - MARGIN_X - 6 - valX), size);
        let first = true;
        for (const vLine of valLines) {
          if (!first) ensureSpace(lineHeightFor(size));
          writeSpansLine(vLine, size, valX, yCursor - size);
          if (!first) yCursor -= lineHeightFor(size);
          first = false;
        }
        yCursor -= lineHeightFor(size);
      }
      yCursor -= 4;
      continue;
    }

    if (block.kind === "table") {
      const size = 9;
      void (lineHeightFor(size) + 6);
      void (lineHeightFor(10) + 8);
      // Colonnes effectives
      const cols = block.cols.length ? block.cols : [{ label: "", wRatio: 1 }];
      const totalW = CONTENT_W;
      const colXs: number[] = [];
      const colWidths: number[] = [];
      {
        let cx = MARGIN_X;
        const sum = cols.reduce((a, b) => a + b.wRatio, 0) || 1;
        for (const c of cols) {
          const w = Math.round((c.wRatio / sum) * totalW);
          colXs.push(cx); colWidths.push(w);
          cx += w;
        }
        // Ajuste la dernière largeur pour ne pas déborder.
        colWidths[colWidths.length - 1] = PAGE_W - MARGIN_X - colXs[colXs.length - 1];
      }
      if (block.title) {
        ensureSpace(lineHeightFor(12) + 6);
        yCursor -= 4;
        writeTextLine(block.title, 12, true, false, MARGIN_X, yCursor - 12);
        yCursor -= lineHeightFor(12);
      }
      // Estime le nombre de lignes par cellule (multi-lignes dans cellule).
      const computeCellSpans = (text: string, idxCol: number, bold: boolean, sz: number) => {
        const raw: PdfTextSpan[] = parseInlineMd(text).length ? parseInlineMd(text) : [{ text }];
        // Force bold si demandé.
        const spans = bold ? raw.map(s => ({ text: s.text, bold: true as const })) : raw;
        return wrapSpans(spans, colWidths[idxCol] - 8, sz);
      };

      const headerCells = cols.map((c, idx) => ({
        text: c.label,
        lines: computeCellSpans(c.label ?? "", idx, true, 10),
      }));
      const headerLinesMax = Math.max(1, ...headerCells.map(c => c.lines.length));
      const headerBlockH = headerLinesMax * lineHeightFor(10) + 10;

      const ensureHeader = () => ensureSpace(headerBlockH + 20);
      const ensureRowBlock = (extra: number) => ensureSpace(extra);

      ensureHeader();
      yCursor -= 6;
      const headerYTop = yCursor;
      const headerYBot = yCursor - headerBlockH;
      for (let c = 0; c < cols.length; c++) {
        const x = colXs[c] + 5;
        const lines = headerCells[c].lines;
        for (let li = 0; li < lines.length; li++) {
          const yText = headerYTop - 12 - li * lineHeightFor(10);
          writeSpansLine(lines[li], 10, x, yText);
        }
      }
      // Lignes d'entête
      writeRule(headerYTop, 1.0);
      writeRule(headerYBot, 0.6);
      yCursor = headerYBot - 4;

      let alt = false;
      for (const rawRow of block.rows) {
        alt = !alt;
        const cells = cols.map((_, idx) => ({
          text: String(rawRow[idx] ?? ""),
          lines: computeCellSpans(String(rawRow[idx] ?? ""), idx, false, size),
        }));
        const cellLnsMax = Math.max(1, ...cells.map(c => c.lines.length));
        const blockH = cellLnsMax * lineHeightFor(size) + 10;
        ensureRowBlock(blockH + 4);
        const yTop = yCursor - 2;
        const yBot = yTop - blockH;
        // Fond alterné très léger : rectangle plein pâle.
        // Opérateurs PDF : rg = fill (couleur texte + rect f) ; RG = stroke (règles).
        // IMPORTANT : remettre `0 0 0 rg` (remplissage NOIR) APRÈS le `f` sinon
        // le texte des lignes paires est gris 0.965 → invisible sur fond 0.965.
        if (alt) {
          const g = 0.965;
          pushOp(enc(
            `${g} ${g} ${g} rg\n` +
            `${colXs[0]} ${yBot.toFixed(2)} ${(PAGE_W - 2 * MARGIN_X).toFixed(2)} ${(yTop - yBot).toFixed(2)} re f\n` +
            `0 0 0 rg\n` +  // ← fill texte = NOIR (rétabli)
            `0 0 0 RG\n`,   // stroke noir
          ));
        }
        for (let c = 0; c < cols.length; c++) {
          const x = colXs[c] + 5;
          const { lines } = cells[c];
          for (let li = 0; li < lines.length; li++) {
            const yText = yTop - 10 - li * lineHeightFor(size);
            writeSpansLine(lines[li], size, x, yText);
          }
        }
        writeRule(yBot, 0.25);
        yCursor = yBot - 2;
      }
      yCursor -= 6;
      continue;
    }
  }

  if (current.length) pagesBuffers.push(current);
  if (!pagesBuffers.length) {
    pagesBuffers.push([enc("")]); // page vide si aucun bloc transmis — cas rare
  }
  // Flat par page en un Uint8Array unique.
  return pagesBuffers.map(arr => {
    const totalLen = arr.reduce((a, b) => a + b.length, 0);
    const flat = new Uint8Array(totalLen);
    let p = 0;
    for (const part of arr) { flat.set(part, p); p += part.length; }
    return flat;
  });
}

// ---------------------------------------------------------------------------
// 6. Assemblage PDF complet (objets, xref, trailer, %%EOF).
// ---------------------------------------------------------------------------
interface IndirectObject { num: number; bytes: Uint8Array; }

function buildPdfBytes(pageStreams: Uint8Array[], title: string, createdAt: Date): Uint8Array {
  const objects: IndirectObject[] = [];
  let numCounter = 0;
  const newNum = () => ++numCounter;
  const pushObj = (num: number, body: Uint8Array) => objects.push({ num, bytes: body });

  // 1. Catalogue (num 1)
  // 2. Pages (num 2) — /Kids /Count
  // 3..(2+N)  — Page (N = pageStreams.length)
  // 4..+3N+1 — Contenu stream (1 par page), 2 fonts + resources dict
  // On construit les références pas à pas.

  const catalogNum = newNum();
  const pagesNum = newNum();
  const fontHelNum = newNum();
  const fontHBoldNum = newNum();
  const fontHObNum = newNum();
  const fontHBoldObNum = newNum();
  const resourcesNum = newNum();

  const N = pageStreams.length;
  const pageNums = Array.from({ length: N }, () => newNum());
  const contentNums = Array.from({ length: N }, () => newNum());

  // Font objets (Standard 14 — sans stream)
  pushObj(fontHelNum, enc(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n`));
  pushObj(fontHBoldNum, enc(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n`));
  pushObj(fontHObNum, enc(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\n`));
  pushObj(fontHBoldObNum, enc(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>\n`));

  // Resources dict — partageable (mêmes fonts pour toutes les pages)
  pushObj(resourcesNum, enc(
    `<< /Font << /${F_HEL.id} ${fontHelNum} 0 R /${F_HB.id} ${fontHBoldNum} 0 R /${F_HO.id} ${fontHObNum} 0 R /${F_HBO.id} ${fontHBoldObNum} 0 R >> /ProcSet [/PDF /Text] >>\n`,
  ));

  // Pages dict (num 2)
  const kidsStr = pageNums.map(n => `${n} 0 R`).join(" ");
  pushObj(pagesNum, enc(`<< /Type /Pages /Count ${N} /Kids [${kidsStr}] >>\n`));

  // Catalog
  pushObj(catalogNum, enc(`<< /Type /Catalog /Pages ${pagesNum} 0 R /Lang (fr-FR) >>\n`));

  // Pages & Contents
  for (let i = 0; i < N; i++) {
    const stream = pageStreams[i];
    pushObj(contentNums[i], concatParts([
      enc(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      enc(`\nendstream\n`),
    ]));
    const pageDict = enc(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resourcesNum} 0 R /Contents ${contentNums[i]} 0 R >>\n`,
    );
    pushObj(pageNums[i], pageDict);
  }

  // Infos dict
  const infoNum = newNum();
  const titleBytes = escapeLiteral(toWinAnsi(title));
  const authorBytes = escapeLiteral(toWinAnsi("ARGOS IRIS — plateforme de commandement"));
  const subjectBytes = escapeLiteral(toWinAnsi("Rapport de situation opérationnelle"));
  const pdfDate = formatPdfDate(createdAt);
  const dateBytes = escapeLiteral(toWinAnsi(pdfDate));
  pushObj(infoNum, concatParts([
    enc("<< /Title ("), titleBytes, enc(") /Author ("), authorBytes,
    enc(") /Subject ("), subjectBytes, enc(") /Creator (IRIS Copilot) /Producer (ARGOS-R-1) "),
    enc(`/CreationDate (`), dateBytes, enc(`) /ModDate (`), dateBytes, enc(") >>\n"),
  ]));

  // Assemblage final
  const preamble = enc("%PDF-1.4\n%\xff\xff\xff\xff\n");
  // Tableau offsets des objets dans le fichier.
  const offsets: number[] = new Array(objects.length + 1).fill(0);
  // Construction binaire finale.
  const byNum = new Map<number, Uint8Array>();
  for (const o of objects) byNum.set(o.num, o.bytes);

  // Calcul taille : écriture séquentielle.
  let fileSize = preamble.length;
  const tail = "\nendobj\n";
  for (let n = 1; n <= numCounter; n++) {
    offsets[n] = fileSize;
    const objBytes = byNum.get(n)!;
    fileSize += `${n} 0 obj\n`.length + objBytes.length + tail.length;
  }
  const xrefOffset = fileSize;
  fileSize += `xref\n0 ${numCounter + 1}\n`.length;
  fileSize += (numCounter + 1) * 20; // 20 chars / entry
  fileSize += `trailer\n<< /Size ${numCounter + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`.length;

  const out = new Uint8Array(fileSize);
  let pos = 0;
  const write = (b: Uint8Array) => { out.set(b, pos); pos += b.length; };
  const writeStr = (s: string) => write(enc(s));

  write(preamble);
  for (let n = 1; n <= numCounter; n++) {
    offsets[n] = pos;
    writeStr(`${n} 0 obj\n`);
    write(byNum.get(n)!);
    writeStr("endobj\n");
  }
  const xrefPos = pos;
  writeStr(`xref\n0 ${numCounter + 1}\n`);
  writeStr("0000000000 65535 f \n");
  for (let n = 1; n <= numCounter; n++) {
    const o = offsets[n].toString(10).padStart(10, "0");
    writeStr(`${o} 00000 n \n`);
  }
  writeStr(`trailer\n<< /Size ${numCounter + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
  return out.slice(0, pos);
}

function concatParts(parts: (Uint8Array | string)[]): Uint8Array {
  const bufs = parts.map(p => typeof p === "string" ? enc(p) : p);
  const total = bufs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of bufs) { out.set(b, p); p += b.length; }
  return out;
}

function formatPdfDate(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const ah = pad(Math.floor(Math.abs(offMin) / 60));
  const am = pad(Math.abs(offMin) % 60);
  return `D:${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${sign}${ah}'${am}'`;
}

// ---------------------------------------------------------------------------
// 7. Pipeline public : AiMessage → Bloc PDF → Bytes.
// ---------------------------------------------------------------------------

export interface PdfLabels {
  kv: { edited_by: string; date: string; utc_time: string; query: string };
  footer: { generated: string };
  fallback: { operator: string; intent: string };
  intent: Partial<Record<NonNullable<AiMessage["intent"]>, string>>;
  kpi: {
    title: string;
    incidents_open: string; incidents_prog: string; incidents_closed: string;
    gravity: string; gravity_high: string; gravity_medium: string; gravity_low: string;
    dead: string; injured: string; missing: string; rescued: string;
    units_ready: string; units_deployed: string; avg_readiness: string;
    hospitals: string; avg_occ: string;
  };
  tables: {
    incidents: { title: string; ref: string; title_col: string; region: string; type: string; grav: string; state: string; declared: string };
    units: { title: string; name: string; city: string; avail: string; eta: string; caps: string };
    hospitals: { title: string; name: string; city: string; occ: string; icu: string; beds: string; icu_beds: string; dist: string };
    equipment: { title: string; desig: string; cat: string; stock: string; threshold: string; cond: string; unit: string };
    quakes: { title: string; region: string; mag: string; depth: string; datetime_utc: string };
  };
  locale: "fr-FR" | "en-GB" | "en-US" | "ar-MA" | (string & {});
}

const DEFAULT_PDF_LABELS: PdfLabels = {
  kv: { edited_by: "Édité par", date: "Date", utc_time: "Heure (UTC)", query: "Requête" },
  footer: { generated: "Ce document est généré automatiquement par le Copilot IRIS à partir de l'état opérationnel de la plateforme." },
  fallback: { operator: "Poste de commandement", intent: "Rapport de situation" },
  intent: {
    global_overview: "Vue globale opérationnelle",
    sitrep: "SITREP — Rapport de situation",
    orsec_summary: "Synthèse du dispositif ORSEC",
    casualties_summary: "Bilan humain consolidé",
    trends: "Tendances incidents",
    trend_incidents: "Tendances incidents",
    today_incidents: "Incidents du jour",
    last24h_summary: "Résumé des dernières 24 heures",
    today_vs_yesterday: "Aujourd'hui vs hier",
    activity_peaks: "Pics d'activité",
    unusual_evolution: "Évolutions inhabituelles",
    touched_zones: "Zones les plus touchées",
    critical_concentration: "Concentrations critiques",
    riskiest_zone: "Zones à plus haut risque",
    risks_prediction: "Prédictions IA de risques",
    risks_zone: "Risques par zone",
    incidents_list: "Liste des incidents",
    hospitals_status: "État du réseau de santé",
    units_status: "Posture des unités FAR",
  },
  kpi: {
    title: "KPI opérationnels",
    incidents_open: "Incidents — ouverts", incidents_prog: "Incidents — en cours", incidents_closed: "Incidents — clôturés",
    gravity: "Gravité", gravity_high: "HAUTE", gravity_medium: "MODÉRÉE", gravity_low: "FAIBLE",
    dead: "Décès (ORSEC)", injured: "Blessés", missing: "Disparus", rescued: "Secourus",
    units_ready: "Unités prêtes", units_deployed: "Unités déployées", avg_readiness: "Readiness moyenne",
    hospitals: "Établissements", avg_occ: "Occ. moyenne",
  },
  tables: {
    incidents: { title: "Incidents ({n})", ref: "Réf.", title_col: "Titre", region: "Région", type: "Type", grav: "Grav.", state: "État", declared: "Déclaré" },
    units: { title: "Unités concernées ({n})", name: "Unité", city: "Ville", avail: "Dispo.", eta: "ETA (min)", caps: "Capacités" },
    hospitals: { title: "Réseau de santé ({n})", name: "Établissement", city: "Ville", occ: "Occ.%", icu: "REA%", beds: "Lits", icu_beds: "REA", dist: "Distance" },
    equipment: { title: "Inventaire & stocks ({n})", desig: "Désignation", cat: "Catégorie", stock: "Stock", threshold: "Seuil", cond: "État", unit: "Unité" },
    quakes: { title: "Activité sismique ({n})", region: "Région", mag: "Magn.", depth: "Profondeur (km)", datetime_utc: "Date / heure (UTC)" },
  },
  locale: "fr-FR",
};

function mergeLabels(partial?: Partial<PdfLabels>): PdfLabels {
  if (!partial) return DEFAULT_PDF_LABELS;
  return {
    kv: { ...DEFAULT_PDF_LABELS.kv, ...(partial.kv ?? {}) },
    footer: { ...DEFAULT_PDF_LABELS.footer, ...(partial.footer ?? {}) },
    fallback: { ...DEFAULT_PDF_LABELS.fallback, ...(partial.fallback ?? {}) },
    intent: { ...DEFAULT_PDF_LABELS.intent, ...(partial.intent ?? {}) },
    kpi: { ...DEFAULT_PDF_LABELS.kpi, ...(partial.kpi ?? {}) },
    tables: {
      incidents: { ...DEFAULT_PDF_LABELS.tables.incidents, ...(partial.tables?.incidents ?? {}) },
      units: { ...DEFAULT_PDF_LABELS.tables.units, ...(partial.tables?.units ?? {}) },
      hospitals: { ...DEFAULT_PDF_LABELS.tables.hospitals, ...(partial.tables?.hospitals ?? {}) },
      equipment: { ...DEFAULT_PDF_LABELS.tables.equipment, ...(partial.tables?.equipment ?? {}) },
      quakes: { ...DEFAULT_PDF_LABELS.tables.quakes, ...(partial.tables?.quakes ?? {}) },
    },
    locale: partial.locale ?? DEFAULT_PDF_LABELS.locale,
  };
}

export interface PdfMessageReportOptions {
  operatorName?: string;
  labels?: Partial<PdfLabels>;
}

const INTENT_LABELS: Partial<Record<NonNullable<AiMessage["intent"]>, string>> = DEFAULT_PDF_LABELS.intent;

const DETECTION_REGEXES: RegExp[] = [
  /situation (actuelle|globale|g[eé]n[eé]rale|op[eé]rationnelle)/i,
  /vue d'ensemble|vue globale|apercu general|panorama|etat des lieux/i,
  /rapport de situation|compte[- ]rendu|brouillon/i,
  /SITREP/i,
  /ORSEC|dispositif/i,
  /bilan humain|victimes|d[eé]c[eè]s|bless[eé]s|disparus|infect[eé]s|contamin[eé]s/i,
  /tendances|eévolution 30 j|incidents par (type|r[eé]gion)/i,
  /derni[èe]res 24 heures|24 h|derniers jours/i,
  /horodatage_utc|SNAPSHOT_OPERATIONNEL|📋 VUE GLOBALE/i,
];

export function isReportableMessage(msg: AiMessage): boolean {
  if (msg.role !== "assistant") return false;
  if (msg.intent) {
    if (INTENT_LABELS[msg.intent]) return true;
    if ([
      "casualties_summary", "trends", "trend_incidents", "today_incidents",
      "last24h_summary", "today_vs_yesterday", "activity_peaks", "unusual_evolution",
      "touched_zones", "critical_concentration", "riskiest_zone", "risks_prediction",
      "risks_zone", "incidents_list", "hospitals_status", "units_status",
      "incidents_near_city", "equipment_critical_status", "mobilizable_potential",
      "cross_analysis",
    ].includes(msg.intent)) return true;
  }
  // Fallback heuristique : le texte produit par le LLM sur une réponse de type
  // situation comporte une signature R3 (horodatage) ou une des regexes
  // d'intention. Permet aussi de rattraper les anciennes questions (intent
  // inconnu du jour 1, mais réponse valide).
  const text = msg.text ?? "";
  return DETECTION_REGEXES.some(r => r.test(text));
}

/**
 * Construit une liste de Blocks à partir d'un `AiMessage` en combinant le
 * markdown du texte + les blocs structurés (stats → KV, incidents/units/
 * hospitals/quakes/equipment → tableaux).
 */
export function buildBlocksFromMessage(msg: AiMessage, labels: PdfLabels = DEFAULT_PDF_LABELS): Block[] {
  const out: Block[] = [];

  // Pré-nettoyage anti-caractères invisibles / de contrôle qui deviendraient
  // des points d'interrogation parasites dans WinAnsi.
  const cleanedText = stripInvisibleFormat(msg.text ?? "");
  const bodyBlocks = markdownToBlocks(cleanedText);
  out.push(...bodyBlocks);

  // Détermine QUELLES sections structurées ajouter selon l'intention.
  // Règle générale : le markdown du message contient déjà le contenu
  // PRINCIPAL demandé. Les sections structurées ne sont ajoutées QUE si
  // l'intention est cohérente (évite de polluer « bilan humain » avec
  // la liste complète des incidents, par exemple).
  const intent = msg.intent ?? "";
  type GroupKey = "stats" | "incidents" | "units" | "hospitals" | "equipment" | "quakes";
  const want: Record<GroupKey, boolean> = {
    stats: true,          // KPI opérationnels : toujours utiles
    incidents: false,
    units: false,
    hospitals: false,
    equipment: false,
    quakes: false,
  };

  switch (intent) {
    // — Vues d'ensemble / SITREP / ORSEC = tout afficher
    case "global_overview":
    case "sitrep":
    case "orsec_summary":
    case "last24h_summary":
    case "today_vs_yesterday":
    case "activity_peaks":
    case "unusual_evolution":
    case "touched_zones":
    case "critical_concentration":
    case "riskiest_zone":
    case "risks_prediction":
    case "risks_zone":
    case "cross_analysis":
    case "incidents_near_city":
      want.incidents = true;
      want.units = true;
      want.hospitals = true;
      want.equipment = true;
      want.quakes = true;
      break;

    // — Tendances / listes d'incidents = incidents + stats + séismes
    case "trends":
    case "trend_incidents":
    case "today_incidents":
    case "incidents_list":
      want.incidents = true;
      want.quakes = true;
      break;

    // — Bilan humain : on ne rajoute PAS la liste complète des incidents
    //   (le markdown contient déjà « Par incident » si nécessaire).
    case "casualties_summary":
      break;

    // — Santé : hôpitaux + stats
    case "hospitals_status":
      want.hospitals = true;
      break;

    // — Unités / posture FAR : unités + équipements + stats
    case "units_status":
    case "equipment_critical_status":
    case "mobilizable_potential":
      want.units = true;
      want.equipment = true;
      break;

    // — Inconnu / fallback : on ajoute tout (rétro-compatibilité avant intent)
    default:
      if (!intent) {
        want.incidents = true;
        want.units = true;
        want.hospitals = true;
        want.equipment = true;
        want.quakes = true;
      }
      break;
  }

  // 2. KPI — stats.items
  if (want.stats && msg.stats?.items && msg.stats.items.length) {
    const pairs: { label: string; value: string | number }[] = [];
    const s = msg.stats;
    if (s.open !== undefined) pairs.push({ label: labels.kpi.incidents_open, value: s.open });
    if (s.prog !== undefined) pairs.push({ label: labels.kpi.incidents_prog, value: s.prog });
    if (s.closed !== undefined) pairs.push({ label: labels.kpi.incidents_closed, value: s.closed });
    if (s.high !== undefined || s.medium !== undefined || s.low !== undefined) {
      const gravs = [
        `${labels.kpi.gravity_high} ${s.high ?? 0}`,
        `${labels.kpi.gravity_medium} ${s.medium ?? 0}`,
        `${labels.kpi.gravity_low} ${s.low ?? 0}`,
      ].join(" · ");
      pairs.push({ label: labels.kpi.gravity, value: gravs });
    }
    if (s.dead !== undefined) pairs.push({ label: labels.kpi.dead, value: s.dead });
    if (s.injured !== undefined) pairs.push({ label: labels.kpi.injured, value: s.injured });
    if (s.missing !== undefined) pairs.push({ label: labels.kpi.missing, value: s.missing });
    if (s.rescued !== undefined) pairs.push({ label: labels.kpi.rescued, value: s.rescued });
    if (s.unitsReady !== undefined) pairs.push({ label: labels.kpi.units_ready, value: s.unitsReady });
    if (s.unitsDeployed !== undefined) pairs.push({ label: labels.kpi.units_deployed, value: s.unitsDeployed });
    if (s.avgReadiness !== undefined) pairs.push({ label: labels.kpi.avg_readiness, value: `${s.avgReadiness} %` });
    if (s.totalHospitals !== undefined) pairs.push({ label: labels.kpi.hospitals, value: s.totalHospitals });
    if (s.occMoyennePct !== undefined) pairs.push({ label: labels.kpi.avg_occ, value: `${s.occMoyennePct} %` });
    pairs.push(...msg.stats.items.map(it => ({ label: it.label, value: it.value })));
    if (pairs.length) out.push({ kind: "kv", title: labels.kpi.title, pairs });
  }

  const tblTitle = (tpl: string, n: number): string => tpl.replace("{n}", String(n));

  // 3. Incidents
  if (want.incidents && msg.incidents && msg.incidents.length) {
    const tc = labels.tables.incidents;
    const cols = [
      { label: tc.ref, wRatio: 0.9 },
      { label: tc.title_col, wRatio: 2.3 },
      { label: tc.region, wRatio: 1.2 },
      { label: tc.type, wRatio: 1.0 },
      { label: tc.grav, wRatio: 0.6 },
      { label: tc.state, wRatio: 0.7 },
      { label: tc.declared, wRatio: 1.1 },
    ];
    const rows = msg.incidents.map(i => [
      i.id ?? "",
      i.titre ?? "",
      i.lieu ?? i.region ?? "",
      i.type ?? "",
      i.sev ?? "",
      i.st ?? "",
      i.declared ?? i.time ?? "",
    ]);
    out.push({ kind: "table", title: tblTitle(tc.title, rows.length), cols, rows });
  }

  // 4. Unités
  if (want.units && msg.units && msg.units.length) {
    const tu = labels.tables.units;
    const cols = [
      { label: tu.name, wRatio: 2.0 },
      { label: tu.city, wRatio: 1.1 },
      { label: tu.avail, wRatio: 0.9 },
      { label: tu.eta, wRatio: 0.9 },
      { label: tu.caps, wRatio: 2.2 },
    ];
    const rows = msg.units.map(u => [
      u.nom ?? "",
      u.ville ?? "",
      u.dispo ?? "",
      u.etaMin ?? "—",
      (u.caps ?? []).join(" · "),
    ]);
    out.push({ kind: "table", title: tblTitle(tu.title, rows.length), cols, rows });
  }

  // 5. Hôpitaux
  if (want.hospitals && msg.hospitals && msg.hospitals.length) {
    const th = labels.tables.hospitals;
    const cols = [
      { label: th.name, wRatio: 2.2 },
      { label: th.city, wRatio: 1.2 },
      { label: th.occ, wRatio: 0.8 },
      { label: th.icu, wRatio: 0.8 },
      { label: th.beds, wRatio: 0.7 },
      { label: th.icu_beds, wRatio: 0.7 },
      { label: th.dist, wRatio: 1.0 },
    ];
    const rows = msg.hospitals.map(h => {
      const dist = h.distanceKm ?? h.distKm ?? null;
      return [
        h.nom ?? h.name ?? "",
        h.ville ?? "",
        `${h.occPct ?? 0}`,
        `${h.icuPct ?? 0}`,
        `${h.lits ?? 0}`,
        `${h.rea ?? 0}`,
        dist != null ? `${dist} km` : "—",
      ];
    });
    out.push({ kind: "table", title: tblTitle(th.title, rows.length), cols, rows });
  }

  // 6. Équipements critiques
  if (want.equipment && msg.equipment && msg.equipment.length) {
    const te = labels.tables.equipment;
    const cols = [
      { label: te.desig, wRatio: 2.4 },
      { label: te.cat, wRatio: 1.0 },
      { label: te.stock, wRatio: 0.7 },
      { label: te.threshold, wRatio: 0.7 },
      { label: te.cond, wRatio: 1.0 },
      { label: te.unit, wRatio: 1.3 },
    ];
    const rows = msg.equipment.map(e => [
      e.desig ?? "",
      e.cat ?? "",
      e.stock ?? 0,
      e.seuil ?? "—",
      e.cond ?? "",
      e.unit ?? "",
    ]);
    out.push({ kind: "table", title: tblTitle(te.title, rows.length), cols, rows });
  }

  // 7. Séismes
  if (want.quakes && msg.quakes && msg.quakes.length) {
    const tq = labels.tables.quakes;
    const cols = [
      { label: tq.region, wRatio: 2.0 },
      { label: tq.mag, wRatio: 0.8 },
      { label: tq.depth, wRatio: 1.4 },
      { label: tq.datetime_utc, wRatio: 2.2 },
    ];
    const rows = msg.quakes.map(q => [
      q.region ?? "",
      `M${q.mag.toFixed(1)}`,
      q.depth ?? "—",
      q.time ?? "",
    ]);
    out.push({ kind: "table", title: tblTitle(tq.title, rows.length), cols, rows });
  }

  return out;
}

export interface PdfReportResult {
  bytes: Uint8Array;
  filename: string;
}

export function buildPdfReport(
  msg: AiMessage,
  userMessage?: string,
  opts: PdfMessageReportOptions = {},
): PdfReportResult {
  const labels = mergeLabels(opts.labels);
  const operatorName = opts.operatorName ?? labels.fallback.operator;

  const intentLabel = (msg.intent && labels.intent[msg.intent]) ?? labels.fallback.intent;
  const createdAt = new Date();
  const dateStr = createdAt.toLocaleDateString(labels.locale, { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = createdAt.toLocaleTimeString(labels.locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

  // Page de titre + en-tête (via blocks niveau document).
  const docBlocks: Block[] = [];
  // Bannière simple : IRIS (niveau 1) + sous-titre « intention »
  docBlocks.push({ kind: "heading", level: 1, text: "IRIS" });
  docBlocks.push({
    kind: "text",
    lines: [{ spans: parseInlineMd(intentLabel), size: 12 }],
  });
  docBlocks.push({ kind: "rule", weight: 0.5 });

  docBlocks.push({
    kind: "kv", pairs: [
      { label: labels.kv.edited_by, value: operatorName },
      { label: labels.kv.date, value: dateStr },
      { label: labels.kv.utc_time, value: timeStr },
      userMessage ? { label: labels.kv.query, value: userMessage } : null,
    ].filter(Boolean) as { label: string; value: string | number }[],
  });
  docBlocks.push({ kind: "rule", weight: 0.3 });
  docBlocks.push(...buildBlocksFromMessage(msg, labels));
  docBlocks.push({ kind: "rule", weight: 0.3 });
  docBlocks.push({
    kind: "text",
    lines: [
      { spans: parseInlineMd(labels.footer.generated), size: 9 },
    ],
  });

  const pagesBytes = buildPages(docBlocks);
  const bytes = buildPdfBytes(pagesBytes, `IRIS · ${intentLabel}`, createdAt);

  // Nom de fichier : YYYYMMDD_HHMM_IRIS_SITREP_{INC | intent abbr}.pdf
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const d = createdAt;
  const prefix = `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  const suffix = msg.intent ? msg.intent.toUpperCase() : "REPORT";
  const filename = `${prefix}_IRIS_${suffix.slice(0, 24)}.pdf`;

  return { bytes, filename };
}

/**
 * Déclenche le téléchargement côté navigateur — déclenche l'ancre invisible
 * dotée de `download` et `href = blob:` puis révoque le blob après 30s.
 */
export function triggerDownloadPdf(result: PdfReportResult): void {
  if (typeof window === "undefined") return;
  const u8 = result.bytes as unknown as Uint8Array<ArrayBuffer>;
  const blob = new Blob([u8], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  try { a.click(); } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 30_000);
  }
}
