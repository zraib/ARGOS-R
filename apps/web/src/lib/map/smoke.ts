import type { CustomLayerInterface, CustomRenderMethod, Map as MlMap } from "maplibre-gl";

/**
 * MapLibre passe sa matrice de projection comme `mat4` (gl-matrix), un type
 * qu'il n'exporte pas. On la prend DEPUIS la signature qu'il impose, plutôt que
 * d'en approcher une : approximer ici ferait diverger la couche du contrat au
 * premier changement de version.
 */
type ProjectionMatrix = Parameters<CustomRenderMethod>[1];
import maplibregl from "maplibre-gl";

// ============================================================================
// ARGOS — NAPPE DE FUMÉE (lot N-4)
//
// Le panache était rendu par des formes géométriques : cercles, triangle sous le
// vent, carré ERG. Elles disent exactement ce que disent l'ATP-45 et l'ERG, et
// c'est leur mérite — mais elles ne ressemblent pas à ce qu'un chef de secteur
// voit arriver. Un nuage ne se propage pas en polygone.
//
// LA CONTRAINTE QUI GOUVERNE TOUT LE FICHIER : la fumée ne doit JAMAIS déborder
// du gabarit. Une animation qui dépasserait le périmètre doctrinal affirmerait
// une précision que le modèle n'a pas — et le périmètre est ce sur quoi on pose
// une évacuation. Le confinement n'est donc pas obtenu « en réglant bien les
// paramètres » mais PAR CONSTRUCTION : le polygone est rastérisé en masque, et
// une particule qui sort du masque est immédiatement réémise à la source.
//
// La fumée REMPLACE le remplissage, jamais le CONTOUR : le tracé du gabarit
// reste visible sous elle. On voit le nuage, et on voit la ligne sur laquelle
// on pose le barrage.
//
// AUCUNE DÉPENDANCE NOUVELLE (MASTER_PLAN §4.3) : WebGL brut dans une
// `CustomLayerInterface` MapLibre, deux nuanceurs d'une vingtaine de lignes.
// ============================================================================

/** Particules simulées. Au-delà, le coût CPU par image devient visible. */
const MAX_PARTICLES = 2600;
/** Résolution du masque de confinement, en cellules par côté. */
const MASK_SIZE = 256;

const VERT = `
attribute vec2 a_pos;      // position en coordonnées mercator [0..1]
attribute float a_life;    // 0 = neuf, 1 = dissipé
attribute float a_seed;    // graine par particule, fige la taille et la teinte
uniform mat4 u_matrix;
uniform float u_scale;     // taille de base, en pixels
varying float v_life;
varying float v_seed;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  // La bouffée GROSSIT en vieillissant : c'est ce qui fait lire une dilution
  // plutôt qu'un objet qui s'éloigne.
  gl_PointSize = u_scale * (0.45 + 1.55 * a_life) * (0.7 + 0.6 * a_seed);
  v_life = a_life;
  v_seed = a_seed;
}`;

const FRAG = `
precision mediump float;
uniform vec3 u_color;
uniform float u_opacity;
varying float v_life;
varying float v_seed;
void main() {
  // Bouffée ronde à bord doux : un disque net ferait un semis de pastilles,
  // pas de la fumée.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, 1.9);
  // Apparition brève puis dissipation longue — une bouffée qui naîtrait à
  // pleine opacité clignoterait.
  float fade = smoothstep(0.0, 0.14, v_life) * (1.0 - smoothstep(0.35, 1.0, v_life));
  float a = soft * fade * u_opacity * (0.55 + 0.45 * v_seed);
  gl_FragColor = vec4(u_color * (0.82 + 0.18 * v_seed), a);
}`;

function compile(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

interface Emitter {
  /** Source du rejet, en mercator. */
  x: number;
  y: number;
}

/** Masque de confinement : le gabarit rastérisé sur sa propre emprise. */
interface Mask {
  minX: number;
  minY: number;
  spanX: number;
  spanY: number;
  bits: Uint8Array;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Test d'appartenance par lancer de rayon, sur un anneau mercator. */
function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class SmokeLayer implements CustomLayerInterface {
  readonly id = "nrbc-smoke";
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;

  private map: MlMap | null = null;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;

  private readonly px = new Float32Array(MAX_PARTICLES);
  private readonly py = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly seed = new Float32Array(MAX_PARTICLES);
  private readonly vertexData = new Float32Array(MAX_PARTICLES * 4);

  private emitters: Emitter[] = [];
  private mask: Mask | null = null;
  private active = 0;
  private lastFrame = 0;

  /** Dérive : vecteur mercator par seconde. */
  private driftX = 0;
  private driftY = 0;
  /** Étalement latéral, en mercator par seconde. */
  private spread = 0;
  private color: [number, number, number] = [0.85, 0.7, 0.3];
  private opacity = 0;

  constructor(private readonly onNeedsRepaint: () => void) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    this.program = p;
    this.buffer = gl.createBuffer();
  }

  onRemove(): void {
    const gl = this.gl;
    if (gl) {
      if (this.program) gl.deleteProgram(this.program);
      if (this.buffer) gl.deleteBuffer(this.buffer);
    }
    this.program = null;
    this.buffer = null;
    this.gl = null;
    this.map = null;
  }

  /**
   * Installe un gabarit. `fc` porte les polygones du référentiel primaire —
   * ceux-là seuls, jamais l'union de tous : la fumée doit tenir dans ce que
   * l'opérateur voit tracé.
   *
   * `windFromDeg` est la direction D'OÙ vient le vent (convention
   * météorologique), comme partout ailleurs dans ARGOS.
   */
  setPlume(
    fc: GeoJSON.FeatureCollection | null,
    source: [number, number] | null,
    windFromDeg: number | null,
    windSpeedKmh: number | null,
    colorHex: string,
    opacity: number,
  ): void {
    this.opacity = opacity;
    this.color = hexToRgb(colorHex);

    if (!fc || fc.features.length === 0 || !source || opacity <= 0) {
      this.mask = null;
      this.emitters = [];
      this.active = 0;
      return;
    }

    const rings: number[][][] = [];
    for (const f of fc.features) {
      const g = f.geometry as GeoJSON.Polygon;
      if (g?.type !== "Polygon" || !g.coordinates?.[0]) continue;
      rings.push(g.coordinates[0].map(([lon, lat]) => {
        const m = maplibregl.MercatorCoordinate.fromLngLat({ lng: lon, lat });
        return [m.x, m.y];
      }));
    }
    if (rings.length === 0) {
      this.mask = null;
      return;
    }

    // --- masque de confinement -----------------------------------------------
    // Le gabarit est rastérisé UNE FOIS par changement de géométrie. Tester
    // l'appartenance polygone par polygone à chaque image, pour chaque
    // particule, coûterait deux cent mille lancers de rayon par image ; ici
    // c'est une lecture de tableau.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rings) {
      for (const [x, y] of r) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const spanX = maxX - minX || 1e-9;
    const spanY = maxY - minY || 1e-9;
    const bits = new Uint8Array(MASK_SIZE * MASK_SIZE);
    for (let j = 0; j < MASK_SIZE; j++) {
      const y = minY + ((j + 0.5) / MASK_SIZE) * spanY;
      for (let i = 0; i < MASK_SIZE; i++) {
        const x = minX + ((i + 0.5) / MASK_SIZE) * spanX;
        let hit = false;
        for (const r of rings) {
          if (inRing(r, x, y)) {
            hit = true;
            break;
          }
        }
        if (hit) bits[j * MASK_SIZE + i] = 1;
      }
    }
    this.mask = { minX, minY, spanX, spanY, bits };

    const m = maplibregl.MercatorCoordinate.fromLngLat({ lng: source[0], lat: source[1] });
    this.emitters = [{ x: m.x, y: m.y }];

    // --- dérive ---------------------------------------------------------------
    // Sans prévision de vent, la nappe respire sur place au lieu de dériver dans
    // une direction inventée : c'est le même parti que les gabarits, qui
    // omettent leurs zones directionnelles quand le vent est inconnu.
    const spanRef = Math.max(spanX, spanY);
    if (windFromDeg === null) {
      this.driftX = 0;
      this.driftY = 0;
      this.spread = spanRef * 0.05;
    } else {
      // Météo : direction D'OÙ vient le vent. Le nuage part à l'opposé.
      const toRad = ((windFromDeg + 180) * Math.PI) / 180;
      // Traversée du gabarit en ~7 s, quelle que soit son étendue : la lecture
      // doit rester la même sur un périmètre de 300 m comme de 10 km.
      const v = spanRef / 7;
      this.driftX = Math.sin(toRad) * v;
      // Mercator : y croît vers le SUD, d'où le signe.
      this.driftY = -Math.cos(toRad) * v;
      this.spread = spanRef * (windSpeedKmh !== null && windSpeedKmh <= 10 ? 0.06 : 0.03);
    }

    this.active = MAX_PARTICLES;
    for (let i = 0; i < MAX_PARTICLES; i++) this.respawn(i, Math.random());
  }

  private respawn(i: number, life = 0): void {
    const e = this.emitters[0];
    if (!e) return;
    // Naissance dispersée autour de la source : toutes les bouffées issues d'un
    // point unique feraient un jet, pas un panache.
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (this.mask ? Math.max(this.mask.spanX, this.mask.spanY) * 0.02 : 0);
    this.px[i] = e.x + Math.cos(a) * r;
    this.py[i] = e.y + Math.sin(a) * r;
    this.life[i] = life;
    this.seed[i] = Math.random();
  }

  private inMask(x: number, y: number): boolean {
    const m = this.mask;
    if (!m) return false;
    const i = Math.floor(((x - m.minX) / m.spanX) * MASK_SIZE);
    const j = Math.floor(((y - m.minY) / m.spanY) * MASK_SIZE);
    if (i < 0 || j < 0 || i >= MASK_SIZE || j >= MASK_SIZE) return false;
    return m.bits[j * MASK_SIZE + i] === 1;
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: ProjectionMatrix): void {
    if (!this.program || !this.buffer || this.active === 0 || !this.mask) return;

    const now = performance.now();
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0.016;
    this.lastFrame = now;

    let n = 0;
    for (let i = 0; i < this.active; i++) {
      // Turbulence : deux sinusoïdes déphasées par la graine. Un bruit de
      // Perlin serait plus juste, mais ceci suffit à casser l'alignement et ne
      // coûte rien — la fumée n'est pas un modèle, c'est une lecture.
      const t = now / 1000 + this.seed[i] * 12;
      const wob = this.spread * (Math.sin(t * 1.7) + Math.sin(t * 0.9 + 1.3)) * 0.5;
      this.px[i] += (this.driftX + wob) * dt;
      this.py[i] += (this.driftY + wob * 0.6) * dt;
      this.life[i] += dt / (3.2 + this.seed[i] * 2.4);

      // CONFINEMENT : hors gabarit ou dissipée, la bouffée renaît à la source.
      // C'est ici, et nulle part ailleurs, que se joue la promesse du lot.
      if (this.life[i] >= 1 || !this.inMask(this.px[i], this.py[i])) {
        this.respawn(i);
        continue;
      }

      const k = n * 4;
      this.vertexData[k] = this.px[i];
      this.vertexData[k + 1] = this.py[i];
      this.vertexData[k + 2] = this.life[i];
      this.vertexData[k + 3] = this.seed[i];
      n++;
    }

    if (n > 0) {
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.subarray(0, n * 4), gl.DYNAMIC_DRAW);

      const stride = 4 * 4;
      const bind = (name: string, size: number, offset: number) => {
        const loc = gl.getAttribLocation(this.program!, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      };
      bind("a_pos", 2, 0);
      bind("a_life", 1, 8);
      bind("a_seed", 1, 12);

      gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "u_matrix"), false, matrix as Float32Array);
      gl.uniform3fv(gl.getUniformLocation(this.program, "u_color"), this.color);
      gl.uniform1f(gl.getUniformLocation(this.program, "u_opacity"), this.opacity);
      // Taille liée au zoom : à petite échelle les bouffées doivent se serrer
      // pour former une nappe, à grande échelle s'étaler.
      const z = this.map?.getZoom() ?? 10;
      gl.uniform1f(gl.getUniformLocation(this.program, "u_scale"), Math.max(14, Math.min(120, 5 * Math.pow(1.32, z - 8))));

      gl.enable(gl.BLEND);
      // Mélange classique et NON additif : l'additif vire au blanc lumineux et
      // ferait lire un incendie là où il s'agit d'un nuage toxique.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, n);
    }

    // L'animation ne tourne que tant qu'il y a quelque chose à animer.
    this.onNeedsRepaint();
  }
}
