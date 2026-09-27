// ============================================================================
// ARGOS — géométrie du routage sûr (pure, sans dépendance, testée)
//
// Ce que le planificateur d'itinéraire sait faire du plan : mesurer, dire si un
// point est dans une zone, suivre le bord d'une zone pour y chercher des
// sorties, et compter ce qu'un tracé parcourt À L'INTÉRIEUR des zones. Les
// coordonnées sont [longitude, latitude] (ordre GeoJSON), les distances en
// mètres. À l'échelle d'une zone (quelques kilomètres), la sphère suffit.
// ============================================================================

export type LngLat = [number, number];

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Des coordonnées [lng, lat] utilisables (finies, dans les bornes). */
export function isLngLat(v: unknown): v is LngLat {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === "number" &&
    typeof v[1] === "number" &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    Math.abs(v[0]) <= 180 &&
    Math.abs(v[1]) <= 90
  );
}

/** Distance orthodromique en mètres. */
export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur d'une polyligne, en mètres. */
export function pathM(coords: readonly LngLat[]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineM(coords[i - 1], coords[i]);
  return d;
}

/** Cap (degrés depuis le nord, sens horaire) de `a` vers `b`. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Le point atteint depuis `from` en suivant le cap donné sur `distanceM` mètres. */
export function destination(from: LngLat, bearing: number, distanceM: number): LngLat {
  const d = distanceM / R;
  const b = rad(bearing);
  const lat1 = rad(from[1]);
  const lng1 = rad(from[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [((deg(lng2) + 540) % 360) - 180, deg(lat2)];
}

/** L'anneau fermé (premier sommet répété à la fin), tel que GeoJSON et le moteur l'attendent. */
export function closeRing(ring: readonly LngLat[]): LngLat[] {
  if (ring.length === 0) return [];
  const [f, l] = [ring[0], ring[ring.length - 1]];
  return f[0] === l[0] && f[1] === l[1] ? [...ring] : [...ring, f];
}

/** Périmètre d'un anneau, en mètres. */
export function ringPerimeterM(ring: readonly LngLat[]): number {
  return pathM(closeRing(ring));
}

/** Un cercle approché par un polygone régulier fermé de `n` côtés. */
export function circleRing(center: LngLat, radiusM: number, n = 32): LngLat[] {
  const ring: LngLat[] = [];
  for (let i = 0; i < n; i++) ring.push(destination(center, (360 * i) / n, radiusM));
  return closeRing(ring);
}

/** Le point est-il dans l'anneau ? (lancer de rayon ; anneau fermé ou non) */
export function pointInRing(p: LngLat, ring: readonly LngLat[]): boolean {
  let dedans = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Le point est-il dans l'une des zones ? */
export function pointInAny(p: LngLat, rings: readonly (readonly LngLat[])[]): boolean {
  return rings.some((r) => pointInRing(p, r));
}

/** Centre d'un anneau : la moyenne de ses sommets (sommet de fermeture exclu). */
export function ringCentroid(ring: readonly LngLat[]): LngLat {
  const pts = closeRing(ring).slice(0, -1);
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  return [sx / pts.length, sy / pts.length];
}

/**
 * Des points régulièrement espacés le long du bord d'un anneau : un tous les
 * `stepM` mètres, `max` au plus (le pas s'allonge alors pour couvrir tout le
 * tour). C'est là qu'on cherche les sorties d'une zone.
 */
export function sampleRing(ring: readonly LngLat[], stepM: number, max: number): LngLat[] {
  const r = closeRing(ring);
  const perimetre = pathM(r);
  if (perimetre === 0) return r.slice(0, 1);
  const pas = Math.max(stepM, perimetre / max);
  const out: LngLat[] = [];
  let prochain = 0;
  let parcouru = 0;
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1];
    const b = r[i];
    const seg = haversineM(a, b);
    while (seg > 0 && prochain <= parcouru + seg && out.length < max) {
      const t = (prochain - parcouru) / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      prochain += pas;
    }
    parcouru += seg;
  }
  return out;
}

/** Éloigne `p` de `center` de `distanceM` mètres, dans l'axe centre → point. */
export function pushOutward(p: LngLat, center: LngLat, distanceM: number): LngLat {
  return destination(p, bearingDeg(center, p), distanceM);
}

/** Retire les points plus proches que `minM` d'un point déjà gardé (l'ordre fait la priorité). */
export function thinPoints(points: readonly LngLat[], minM: number): LngLat[] {
  const out: LngLat[] = [];
  for (const p of points) if (!out.some((q) => haversineM(p, q) < minM)) out.push(p);
  return out;
}

/**
 * Mètres d'un tracé parcourus À L'INTÉRIEUR des zones : chaque segment est
 * découpé en tronçons de 50 m au plus, un tronçon compte s'il a son milieu
 * dans une zone. Assez fin pour dire « 1,8 km dans la zone de danger ».
 */
export function lengthInsideM(coords: readonly LngLat[], rings: readonly (readonly LngLat[])[]): number {
  if (rings.length === 0) return 0;
  let dedans = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = haversineM(a, b);
    const n = Math.max(1, Math.ceil(seg / 50));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      if (pointInAny([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], rings)) dedans += seg / n;
    }
  }
  return dedans;
}

/** Emprise [ouest, sud, est, nord] en degrés. */
export type BBox = [number, number, number, number];

export function bboxOf(coords: readonly LngLat[]): BBox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of coords) {
    if (x < w) w = x;
    if (y < s) s = y;
    if (x > e) e = x;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/** L'emprise élargie de `m` mètres de chaque côté. */
export function expandBBox(b: BBox, m: number): BBox {
  const dLat = m / 111_320;
  const dLng = m / (111_320 * Math.max(0.2, Math.cos(rad((b[1] + b[3]) / 2))));
  return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
}

/**
 * Le couloir d'un trajet : l'emprise de ses étapes élargie de 20 km, ou de 30 %
 * de sa diagonale si c'est plus. Un détour qui en sortirait est rattrapé par la
 * vérification du tracé contre TOUTES les zones.
 */
export function corridorBox(points: readonly LngLat[]): BBox {
  const b = bboxOf(points);
  return expandBBox(b, Math.max(20_000, 0.3 * haversineM([b[0], b[1]], [b[2], b[3]])));
}

function orient(a: LngLat, b: LngLat, c: LngLat): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: LngLat, b: LngLat, p: LngLat): boolean {
  return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
}

/** Les segments [p1 p2] et [q1 q2] se touchent-ils (colinéarité comprise) ? */
export function segmentsIntersect(p1: LngLat, p2: LngLat, q1: LngLat, q2: LngLat): boolean {
  const d1 = orient(q1, q2, p1);
  const d2 = orient(q1, q2, p2);
  const d3 = orient(p1, p2, q1);
  const d4 = orient(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (
    (d1 === 0 && onSegment(q1, q2, p1)) ||
    (d2 === 0 && onSegment(q1, q2, p2)) ||
    (d3 === 0 && onSegment(p1, p2, q1)) ||
    (d4 === 0 && onSegment(p1, p2, q2))
  );
}

/**
 * Le tracé entre-t-il dans l'une des zones ? Un sommet dedans, ou un segment
 * qui coupe un bord — exact, là où un échantillonnage laisserait passer un
 * coin de zone rogné en quelques mètres.
 */
export function pathCrossesRings(coords: readonly LngLat[], rings: readonly (readonly LngLat[])[]): boolean {
  if (coords.length === 0 || rings.length === 0) return false;
  for (const ring of rings) {
    const r = closeRing(ring);
    const rb = bboxOf(r);
    if (!bboxIntersects(bboxOf(coords), rb)) continue;
    if (coords.some((p) => p[0] >= rb[0] && p[0] <= rb[2] && p[1] >= rb[1] && p[1] <= rb[3] && pointInRing(p, r))) return true;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      if (!bboxIntersects(bboxOf([a, b]), rb)) continue;
      for (let k = 1; k < r.length; k++) if (segmentsIntersect(a, b, r[k - 1], r[k])) return true;
    }
  }
  return false;
}

/** Décodage d'une polyligne encodée (Valhalla : précision 6) en [lng, lat]. */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: LngLat[] = [];
  const factor = 10 ** precision;
  while (index < str.length) {
    for (const axe of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = str.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axe === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / factor, lat / factor]);
  }
  return out;
}
