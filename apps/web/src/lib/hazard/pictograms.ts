// ============================================================================
// ARGOS — PICTOGRAMMES DE DANGER RÉGLEMENTAIRES (lot N-1)
//
// Jusqu'ici, un incident NRBC portait sur la carte le MÊME triangle « ! » qu'une
// inondation ou un feu de forêt. Sur une plateforme de commandement, c'est une
// information perdue là où elle coûte le plus cher : la nature du danger décide
// des distances d'isolement, de la tenue de protection et du sens d'approche.
//
// CE QUI EST DESSINÉ ICI SUIT LA SIGNALISATION ADR/ONU, pas une interprétation :
//
//   • Toxique (classe 6.1 / 2.3) — losange BLANC, tête de mort et tibias NOIRS.
//   • Radioactif (classe 7)      — moitié haute JAUNE, moitié basse blanche,
//                                  trèfle noir.
//   • Infectieux (classe 6.2)    — losange blanc, symbole de danger biologique.
//
// Le jaune ne désigne PAS le danger chimique dans cette signalisation : il
// désigne la radioactivité (classe 7) et les comburants (5.1). Un losange jaune
// à tête de mort n'existe pas. Le repère jaune demandé est donc porté par
// l'ANNEAU du marqueur cartographique (voir `lib/map/markers.ts`) : signal jaune
// à distance, symbole exact de près.
//
// UNE SEULE GÉOMÉTRIE, DEUX RENDUS. Les marqueurs de carte sont construits comme
// des chaînes HTML (MapLibre), l'interface en React. Décrire les formes en
// données plutôt qu'en JSX permet aux deux de partager la MÊME source : deux
// jeux de tracés auraient fini par diverger, et un pictogramme faux est pire
// qu'un pictogramme générique — il affirme.
//
// Tout est auto-hébergé : aucune ressource externe (MASTER_PLAN §4.3).
// ============================================================================

export const HAZARD_KINDS = ["toxic", "radioactive", "biohazard", "drum"] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

/** Primitive de dessin — volontairement pauvre, pour rester rendable en chaîne. */
export type HazardShape =
  | { t: "polygon"; points: string; fill?: string; stroke?: string; sw?: number }
  | { t: "path"; d: string; fill?: string; stroke?: string; sw?: number; cap?: "round" | "butt" }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: string; stroke?: string; sw?: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; rx?: number; rot?: number; fill?: string; stroke?: string; sw?: number };

export interface HazardPictogram {
  /** Libellé de la classe — sert de `title`/`aria-label`, jamais de décoration. */
  readonly ref: string;
  readonly shapes: readonly HazardShape[];
}

const BLACK = "#0B0B0B";
const WHITE = "#FFFFFF";
/** Jaune ADR classe 7 (radioactif) — la seule place légitime du jaune ici. */
const ADR_YELLOW = "#F5C518";

/** Losange ADR : 64×64, pointes aux milieux des bords. */
const DIAMOND = "32,2 62,32 32,62 2,32";
/** Filet intérieur, à 5 unités du bord — présent sur toutes les étiquettes ADR. */
const DIAMOND_INNER = "32,7.5 56.5,32 32,56.5 7.5,32";

// --- tête de mort et tibias (classes 2.3 et 6.1) ----------------------------
//
// CONTRAINTE DE CADRE. Le losange n'autorise qu'un symbole d'environ 15 unités
// de rayon sur 64 : à une hauteur y, sa demi-largeur intérieure vaut
// 24,5 − |y − 32|. Un premier dessin à 19 débordait — les tibias sortaient du
// cadre et le symbole se lisait comme une tache. Une signalisation qui déborde
// de son étiquette n'est plus une signalisation.
//
// Les tibias croisent DERRIÈRE le crâne, à hauteur de ses tempes : c'est la
// disposition de la planche ADR. Les placer dessous, comme au premier essai,
// obligeait à les allonger pour qu'ils se voient, donc à sortir du losange.

// Longueur et angle poussés jusqu'à la limite du cadre : à 28°, l'extrémité
// d'un tibia (rayon 15,5 + boule 3,3) atteint 48,99 là où le filet intérieur en
// autorise 49,22. Plus court, les barres disparaissaient derrière le crâne et le
// symbole se lisait « un crâne et quatre points ».
const BONE_HALF = 15.5;
const BONE_ANGLE = 28;

function boneKnobs(angleDeg: number): HazardShape[] {
  const a = (angleDeg * Math.PI) / 180;
  const dx = BONE_HALF * Math.cos(a);
  const dy = BONE_HALF * Math.sin(a);
  return [
    { t: "circle", cx: 32 + dx, cy: 32 + dy, r: 3.3, fill: BLACK },
    { t: "circle", cx: 32 - dx, cy: 32 - dy, r: 3.3, fill: BLACK },
  ];
}

const CROSSBONES: HazardShape[] = [
  { t: "rect", x: 32 - BONE_HALF, y: 29.4, w: BONE_HALF * 2, h: 5.2, rx: 2.6, rot: -BONE_ANGLE, fill: BLACK },
  { t: "rect", x: 32 - BONE_HALF, y: 29.4, w: BONE_HALF * 2, h: 5.2, rx: 2.6, rot: BONE_ANGLE, fill: BLACK },
  ...boneKnobs(-BONE_ANGLE),
  ...boneKnobs(BONE_ANGLE),
];

const SKULL: HazardShape[] = [
  // Crâne : calotte arrondie prolongée d'une mâchoire courte, largeur 20.
  {
    t: "path",
    d:
      "M32 17.5c-5.4 0-9.2 3.7-9.2 8.5 0 2.7 1.2 5 3.1 6.4v2.7c0 .8.7 1.5 1.5 1.5h9.2c.8 0 1.5-.7 1.5-1.5v-2.7" +
      "c1.9-1.4 3.1-3.7 3.1-6.4 0-4.8-3.8-8.5-9.2-8.5z",
    fill: BLACK,
  },
  // Orbites — évidées en BLANC : elles percent le crâne sur le fond du losange.
  { t: "ellipse", cx: 28.4, cy: 26.6, rx: 2.6, ry: 2.9, fill: WHITE },
  { t: "ellipse", cx: 35.6, cy: 26.6, rx: 2.6, ry: 2.9, fill: WHITE },
  // Fosse nasale.
  { t: "path", d: "M32 29.4l-1.7 3.4h3.4z", fill: WHITE },
  // Dents.
  { t: "rect", x: 30.1, y: 33.9, w: 1.1, h: 2.7, fill: WHITE },
  { t: "rect", x: 32.8, y: 33.9, w: 1.1, h: 2.7, fill: WHITE },
];

// --- trèfle radioactif (classe 7) -------------------------------------------
//
// Trois pales de 60° entre les rayons 6,5 et 15, à 120° l'une de l'autre, et un
// disque central : la construction de la norme. Les rayons sont dictés par le
// cadre — au-delà de 15, les pales touchent les bords du losange et les trois
// vides de 60°, qui font reconnaître le symbole, cessent de se lire.

function blade(midDeg: number): HazardShape {
  const cx = 32;
  const cy = 32;
  const ri = 6.5;
  const ro = 15;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a1 = rad(midDeg - 30);
  const a2 = rad(midDeg + 30);
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return {
    t: "path",
    d: `M${p(ri, a1)} L${p(ro, a1)} A${ro} ${ro} 0 0 1 ${p(ro, a2)} L${p(ri, a2)} A${ri} ${ri} 0 0 0 ${p(ri, a1)} Z`,
    fill: BLACK,
  };
}

const TREFOIL: HazardShape[] = [blade(-90), blade(30), blade(150), { t: "circle", cx: 32, cy: 32, r: 4.2, fill: BLACK }];

// --- danger biologique (classe 6.2) -----------------------------------------
//
// Trois anneaux OUVERTS vers le centre, à 120°, et un disque central. C'est
// l'ouverture qui fait reconnaître le symbole : au premier essai les anneaux
// étaient trop épais et trop écartés, et l'ensemble se lisait comme trois
// pastilles pleines.

function ring(midDeg: number): HazardShape {
  const rad = (d: number) => (d * Math.PI) / 180;
  const c = { x: 32 + 8.2 * Math.cos(rad(midDeg)), y: 32 + 8.2 * Math.sin(rad(midDeg)) };
  const r = 6.6;
  // Le vide fait face au centre : il est centré sur `midDeg + 180`.
  const start = rad(midDeg + 180 + 52);
  const end = rad(midDeg + 180 - 52);
  const p = (a: number) => `${(c.x + r * Math.cos(a)).toFixed(2)} ${(c.y + r * Math.sin(a)).toFixed(2)}`;
  return { t: "path", d: `M${p(start)} A${r} ${r} 0 1 1 ${p(end)}`, stroke: BLACK, sw: 3.8, fill: "none", cap: "round" };
}

const BIOHAZARD: HazardShape[] = [ring(-90), ring(30), ring(150), { t: "circle", cx: 32, cy: 32, r: 3.4, fill: BLACK }];

// --- fût de matière dangereuse ----------------------------------------------
//
// Le « barril avec danger » : un fût normalisé, ses deux cercles de roulage, et
// l'étiquette losange sur la robe. La flaque signale la FUITE — un fût intact
// n'est pas un incident — et elle déborde d'un côté pour ne pas se confondre
// avec une ombre portée.

const DRUM: HazardShape[] = [
  { t: "path", d: "M13 54c0-3.3 8.5-6 19-6s19 2.7 19 6c0 2.6-6 4-13.5 4.6-6 .5-12 .6-16.5-.6C15.5 57.2 13 55.8 13 54z", fill: "#C79A12" },
  { t: "path", d: "M19 14v32c0 2.6 5.8 4.6 13 4.6s13-2 13-4.6V14z", fill: "#D9A400", stroke: BLACK, sw: 2 },
  { t: "ellipse", cx: 32, cy: 14, rx: 13, ry: 4.4, fill: "#F0BC20", stroke: BLACK, sw: 2 },
  { t: "path", d: "M19.6 24c3.4 1.8 21.4 1.8 24.8 0", fill: "none", stroke: BLACK, sw: 1.8 },
  { t: "path", d: "M19.6 38c3.4 1.8 21.4 1.8 24.8 0", fill: "none", stroke: BLACK, sw: 1.8 },
  { t: "polygon", points: "32,25 39.5,32.5 32,40 24.5,32.5", fill: WHITE, stroke: BLACK, sw: 1.6 },
  { t: "path", d: "M32 28.6l-4.4 8.4h8.8z", fill: BLACK },
];

export const HAZARD_PICTOGRAMS: Record<HazardKind, HazardPictogram> = {
  toxic: {
    ref: "ADR 6.1 — matière toxique",
    shapes: [
      { t: "polygon", points: DIAMOND, fill: WHITE, stroke: BLACK, sw: 2.2 },
      { t: "polygon", points: DIAMOND_INNER, fill: "none", stroke: BLACK, sw: 1.4 },
      ...CROSSBONES,
      ...SKULL,
    ],
  },
  radioactive: {
    ref: "ADR 7 — matière radioactive",
    shapes: [
      { t: "polygon", points: "32,2 62,32 2,32", fill: ADR_YELLOW },
      { t: "polygon", points: "2,32 62,32 32,62", fill: WHITE },
      { t: "polygon", points: DIAMOND, fill: "none", stroke: BLACK, sw: 2.2 },
      { t: "polygon", points: DIAMOND_INNER, fill: "none", stroke: BLACK, sw: 1.4 },
      ...TREFOIL,
    ],
  },
  biohazard: {
    ref: "ADR 6.2 — matière infectieuse",
    shapes: [
      { t: "polygon", points: DIAMOND, fill: WHITE, stroke: BLACK, sw: 2.2 },
      { t: "polygon", points: DIAMOND_INNER, fill: "none", stroke: BLACK, sw: 1.4 },
      ...BIOHAZARD,
    ],
  },
  drum: {
    ref: "Fût de matière dangereuse — fuite",
    shapes: DRUM,
  },
};

/**
 * Famille NRBC déclarée → pictogramme.
 *
 * `N` et `R` partagent le trèfle : la signalisation ne distingue pas l'origine
 * (arme ou source industrielle), seulement le rayonnement. Distinguer les deux
 * ici inventerait un symbole qui n'existe pas.
 */
export const FAMILY_PICTOGRAM: Record<string, HazardKind> = {
  N: "radioactive",
  R: "radioactive",
  B: "biohazard",
  C: "toxic",
};

/** Rend un pictogramme en chaîne SVG — pour les marqueurs MapLibre. */
export function hazardSvgString(kind: HazardKind, size: number): string {
  const p = HAZARD_PICTOGRAMS[kind];
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">` +
    p.shapes.map(shapeToString).join("") +
    "</svg>"
  );
}

function attrs(s: HazardShape): string {
  const fill = "fill" in s && s.fill !== undefined ? s.fill : "none";
  const stroke = "stroke" in s && s.stroke ? ` stroke="${s.stroke}"` : "";
  const sw = "sw" in s && s.sw ? ` stroke-width="${s.sw}"` : "";
  const cap = "cap" in s && s.cap ? ` stroke-linecap="${s.cap}"` : "";
  return ` fill="${fill}"${stroke}${sw}${cap}`;
}

function shapeToString(s: HazardShape): string {
  switch (s.t) {
    case "polygon":
      return `<polygon points="${s.points}"${attrs(s)} />`;
    case "path":
      return `<path d="${s.d}"${attrs(s)} />`;
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"${attrs(s)} />`;
    case "ellipse":
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${attrs(s)} />`;
    case "rect": {
      const rot = s.rot ? ` transform="rotate(${s.rot} ${s.x + s.w / 2} ${s.y + s.h / 2})"` : "";
      const rx = s.rx ? ` rx="${s.rx}"` : "";
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${rx}${rot}${attrs(s)} />`;
    }
  }
}
