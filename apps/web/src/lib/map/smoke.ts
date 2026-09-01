import type { CustomLayerInterface, CustomRenderMethod, Map as MlMap } from "maplibre-gl";
import maplibregl from "maplibre-gl";

// ============================================================================
// ARGOS — NAPPE DE FUMÉE (lots N-4 et N-4b)
//
// Le panache était rendu par des formes géométriques. Elles disent exactement ce
// que disent l'ATP-45 et le GMU 2024 — c'est leur mérite — mais elles ne
// ressemblent pas à ce qu'un chef de secteur voit arriver.
//
// LA CONTRAINTE QUI GOUVERNE TOUT : la fumée ne déborde JAMAIS du gabarit. Une
// animation qui dépasserait le périmètre doctrinal affirmerait une précision que
// le modèle n'a pas — et le périmètre est ce sur quoi on pose une évacuation.
//
// UN SEUL POLYGONE : CELUI DE DIFFUSION. La fumée n'occupe que la zone
// dépendante du vent — la nappe sous le vent, ou le cercle de vigilance par vent
// faible. Le cercle d'ISOLEMENT reste vide : c'est un rayon qu'on POSE autour du
// rejet, pas un nuage qu'on observe. Les remplir tous ferait de la fumée une
// décoration au lieu d'une information.
//
// Ce choix a une conséquence heureuse : le confinement se teste directement
// contre l'anneau du polygone, sans masque rastérisé. Pendant la lecture, la
// géométrie change à CHAQUE image — le gabarit pivote avec le vent ; rebâtir un
// masque de 65 000 cellules par image aurait été ruineux, là où tester
// 3 200 particules contre une trentaine de sommets ne coûte rien.
//
// AUCUNE DÉPENDANCE NOUVELLE (MASTER_PLAN §4.3) : WebGL brut dans une
// `CustomLayerInterface`, deux nuanceurs.
// ============================================================================

const MAX_PARTICLES = 3200;

/**
 * Accélération du temps, en secondes de météo par seconde d'écran.
 *
 * La dérive reste PROPORTIONNELLE à la vitesse du vent — c'est ce qu'on veut
 * lire d'un coup d'œil : une brise et une tempête ne doivent pas se ressembler.
 * Mais à l'échelle réelle, un nuage à 13 km/h met quarante-six minutes à
 * traverser une nappe de 10 km : l'animation serait immobile.
 *
 * À ×120, cette même traversée prend vingt-trois secondes, et une brise à
 * 4 km/h en prend soixante-quinze. Le RAPPORT entre les deux est conservé ;
 * seule l'horloge est accélérée, comme sur une image satellite en accéléré.
 */
const TIME_SCALE = 120;

type ProjectionMatrix = Parameters<CustomRenderMethod>[1];

const VERT = `
attribute vec2 a_pos;      // position en coordonnées mercator [0..1]
attribute float a_life;    // 0 = neuve, 1 = dissipée
attribute float a_seed;    // graine par particule : taille, teinte, turbulence
attribute float a_edge;    // 1 = au large, 0 = contre le bord du gabarit
uniform mat4 u_matrix;
uniform float u_scale;
varying float v_life;
varying float v_seed;
varying float v_edge;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  // GROSSISSEMENT FORT. Une bouffée qui garde sa taille se lit comme un objet
  // qui s'éloigne — un jet. Un gaz se DILATE : le rayon quadruple sur la vie de
  // la particule, et c'est là que se joue la différence entre un filet de
  // liquide et de la fumée.
  gl_PointSize = u_scale * (0.5 + 3.5 * a_life) * (0.75 + 0.5 * a_seed);
  v_life = a_life;
  v_seed = a_seed;
  v_edge = a_edge;
}`;

const FRAG = `
precision mediump float;
uniform vec3 u_core;     // teinte PRINCIPALE — la fumée dense, près du rejet
uniform vec3 u_tail;     // teinte DÉRIVÉE — la fumée secondaire, diluée
uniform float u_opacity;
varying float v_life;
varying float v_seed;
varying float v_edge;
void main() {
  // Bord TRÈS doux : un disque net donne un semis de pastilles, c'est
  // l'exposant élevé qui fait la limite floue d'un gaz.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  float soft = pow(1.0 - r, 2.6);

  // Naissance progressive, dissipation longue : une bouffée née à pleine
  // opacité clignoterait.
  float fade = smoothstep(0.0, 0.22, v_life) * (1.0 - smoothstep(0.30, 1.0, v_life));

  // PRINCIPALE → DÉRIVÉE avec l'âge : le cœur porte la gravité, la traîne dit
  // la dilution. Même information que la teinte du gabarit, rendue continue.
  vec3 col = mix(u_core, u_tail, smoothstep(0.05, 0.75, v_life));

  // Opacité faible par bouffée : la densité vient de la SUPERPOSITION, pas de
  // chaque particule. C'est ce qui donne le grain d'un nuage.
  // EXTINCTION AU BORD DU GABARIT. Le centre de la bouffée est confiné, mais
  // son disque, large de plusieurs dizaines de pixels, débordait. La promesse
  // du lot est que la fumée ne sorte JAMAIS du périmètre : elle s'éteint donc
  // en l'approchant, au lieu de le franchir à moitié.
  float a = soft * fade * u_opacity * (0.45 + 0.55 * v_seed) * v_edge;
  gl_FragColor = vec4(col, a);
}`;

function compile(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return sh;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Test d'appartenance par lancer de rayon, sur un anneau mercator à plat. */
function inRing(ring: Float64Array, n: number, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const yi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const yj = ring[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface SmokeSettings {
  /** Anneau du polygone de DIFFUSION, en lon/lat. Un seul, jamais l'union. */
  ring: [number, number][] | null;
  /** Point de rejet [lon, lat]. */
  source: [number, number] | null;
  /** Direction D'OÙ vient le vent (convention météo), ou `null`. */
  windFromDeg: number | null;
  /** Vitesse du vent en km/h, ou `null`. */
  windSpeedKmh: number | null;
  /** Teinte principale — la fumée dense. */
  core: string;
  /** Teinte dérivée — la fumée secondaire, diluée. */
  tail: string;
  opacity: number;
  /**
   * Diffusion OMNIDIRECTIONNELLE.
   *
   * Vrai quand le gabarit est le cercle de VIGILANCE — c'est-à-dire quand
   * l'ATP-45 juge le vent trop faible ou trop variable pour donner une
   * direction. Le modèle refusant alors de désigner un secteur, la fumée ne doit
   * pas en désigner un non plus : elle s'étend en nappe autour du rejet, et
   * remplit le cercle au lieu d'en occuper une moitié.
   *
   * Sans cela, la lecture contredisait le gabarit qu'elle habite : un cercle
   * « toutes directions » rempli d'un nuage qui part d'un côté.
   */
  omnidirectional: boolean;
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
  private readonly vertexData = new Float32Array(MAX_PARTICLES * 5);

  /** Anneau de diffusion en mercator, à plat : [x0,y0,x1,y1,…]. */
  private ring = new Float64Array(0);
  private ringLen = 0;
  private srcX = 0;
  private srcY = 0;
  private extent = 0;

  private active = 0;
  private lastFrame = 0;

  private driftX = 0;
  private driftY = 0;
  private churn = 0;
  /** Vitesse d'expansion radiale (diffusion omnidirectionnelle), en mercator/s. */
  private radial = 0;
  /** Durée de vie de base, calée sur le temps de traversée du gabarit. */
  private lifeSpan = 7;
  /** Demi-taille de la bouffée en mercator — sert aux sondes de bord. */
  private spriteMerc = 0;
  private core: [number, number, number] = [0.96, 0.45, 0.27];
  private tail: [number, number, number] = [0.99, 0.85, 0.55];
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
   * Installe le gabarit courant.
   *
   * Appelée à CHAQUE image pendant la lecture : la géométrie pivote avec le
   * vent, et la fumée doit suivre. D'où le soin à ne rien allouer ici au-delà du
   * strict nécessaire — l'anneau est réutilisé tant qu'il tient.
   */
  set(s: SmokeSettings): void {
    this.opacity = s.opacity;
    this.core = hexToRgb(s.core);
    this.tail = hexToRgb(s.tail);

    if (!s.ring || s.ring.length < 4 || !s.source || s.opacity <= 0) {
      this.ringLen = 0;
      this.active = 0;
      return;
    }

    const n = s.ring.length;
    if (this.ring.length < n * 2) this.ring = new Float64Array(n * 2);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const m = maplibregl.MercatorCoordinate.fromLngLat({ lng: s.ring[i][0], lat: s.ring[i][1] });
      this.ring[i * 2] = m.x;
      this.ring[i * 2 + 1] = m.y;
      if (m.x < minX) minX = m.x;
      if (m.x > maxX) maxX = m.x;
      if (m.y < minY) minY = m.y;
      if (m.y > maxY) maxY = m.y;
    }
    this.ringLen = n;
    this.extent = Math.max(maxX - minX, maxY - minY) || 1e-9;

    const m = maplibregl.MercatorCoordinate.fromLngLat({ lng: s.source[0], lat: s.source[1] });
    this.srcX = m.x;
    this.srcY = m.y;

    // --- VITESSE PROPORTIONNELLE AU VENT -------------------------------------
    // Le nuage avance à la vitesse RÉELLE du vent. Une durée de traversée fixe
    // donnait la même lecture par brise et par tempête, alors que c'est
    // précisément ce qu'un chef de secteur veut voir d'un coup d'œil.
    //
    // À la latitude φ, une unité mercator vaut 40 075 km × cos(φ).
    const lat = (s.source[1] * Math.PI) / 180;
    const mercPerKm = 1 / (40075 * Math.cos(lat));
    const kmh = s.windSpeedKmh ?? 0;
    const vMerc = (kmh / 3600) * mercPerKm * TIME_SCALE;

    if (s.omnidirectional || s.windFromDeg === null || kmh <= 0) {
      // AUCUNE DÉRIVE DIRECTIONNELLE. Soit la prévision manque, soit le gabarit
      // lui-même est omnidirectionnel : dans les deux cas, désigner un secteur
      // serait affirmer plus que le modèle.
      //
      // À la place, une expansion RADIALE calée pour traverser le rayon en une
      // vie de particule : le nuage gonfle et remplit le cercle, ce qui est
      // exactement ce que « dérive possible dans toutes les directions » veut
      // dire.
      this.driftX = 0;
      this.driftY = 0;
      this.churn = this.extent * 0.05;
      this.radial = (this.extent / 2) / 14;
    } else {
      this.radial = 0;
      const toRad = ((s.windFromDeg + 180) * Math.PI) / 180;
      this.driftX = Math.sin(toRad) * vMerc;
      // Mercator : y croît vers le SUD.
      this.driftY = -Math.cos(toRad) * vMerc;
      // La turbulence croît avec le vent, mais moins vite que la dérive : par
      // vent fort le nuage file droit, par vent faible il tourbillonne.
      this.churn = this.extent * (0.03 + (Math.min(kmh, 60) / 60) * 0.04);
    }

    // DURÉE DE VIE CALÉE SUR LA TRAVERSÉE. Une durée fixe faisait mourir les
    // bouffées avant qu'elles n'atteignent le fond du gabarit : le nuage restait
    // massé sur le rejet et la nappe paraissait vide, alors qu'elle est
    // précisément ce que l'opérateur doit voir se remplir.
    const speed = Math.hypot(this.driftX, this.driftY) + this.radial;
    this.lifeSpan = speed > 0 ? Math.min(26, Math.max(4, this.extent / speed)) : 9;

    if (this.active === 0) {
      this.active = MAX_PARTICLES;
      for (let i = 0; i < MAX_PARTICLES; i++) this.respawn(i, Math.random());
    }
  }

  private respawn(i: number, life = 0): void {
    // Naissance dispersée autour du rejet plutôt qu'en un point : toutes les
    // bouffées issues d'une singularité faisaient un JET.
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.extent * 0.06;
    this.px[i] = this.srcX + Math.cos(a) * r;
    this.py[i] = this.srcY + Math.sin(a) * r;
    this.life[i] = life;
    this.seed[i] = Math.random();
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: ProjectionMatrix): void {
    if (!this.program || !this.buffer || this.active === 0 || this.ringLen === 0) return;

    const now = performance.now();
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0.016;
    this.lastFrame = now;
    const t = now / 1000;

    // Rayon de BASE de la bouffée en mercator — la moitié du dixième d'emprise
    // employé pour la taille à l'écran. Multiplié par le facteur d'âge dans la
    // boucle, il donne le rayon réel du disque dessiné.
    this.spriteMerc = this.extent * 0.05;

    let n = 0;
    for (let i = 0; i < this.active; i++) {
      const sd = this.seed[i];
      // TURBULENCE INDÉPENDANTE PAR PARTICULE.
      //
      // Auparavant toutes partageaient la même sinusoïde et ondulaient EN
      // PHASE : l'ensemble se lisait comme un filet de liquide, pas comme un
      // gaz. Deux fréquences décalées par la graine, appliquées à des axes
      // DIFFÉRENTS, suffisent à décorréler les trajectoires.
      const p1 = t * (0.7 + sd * 0.5) + sd * 31.4;
      const p2 = t * (0.43 + sd * 0.31) + sd * 17.7;
      const wx = Math.sin(p1) * Math.cos(p2 * 1.3);
      const wy = Math.cos(p1 * 1.1) * Math.sin(p2);
      // L'agitation grandit avec l'âge : une bouffée neuve suit le jet, une
      // vieille est brassée. C'est ce qui fait le bord effiloché.
      const grow = 0.35 + this.life[i] * 1.4;

      let vx = this.driftX;
      let vy = this.driftY;
      if (this.radial > 0) {
        // Expansion depuis le rejet. Le facteur d'âge fait accélérer la nappe
        // en s'éloignant, ce qui donne un front qui s'ouvre au lieu d'un disque
        // qui grossit uniformément.
        const dx = this.px[i] - this.srcX;
        const dy = this.py[i] - this.srcY;
        const d = Math.hypot(dx, dy) || 1e-12;
        const push = this.radial * (0.4 + this.life[i]);
        vx += (dx / d) * push;
        vy += (dy / d) * push;
      }
      this.px[i] += (vx + wx * this.churn * grow) * dt;
      this.py[i] += (vy + wy * this.churn * grow) * dt;
      // Vie longue : la dissipation lente laisse les bouffées se superposer, et
      // c'est la superposition qui fait la matière du nuage.
      this.life[i] += dt / (this.lifeSpan * (0.75 + sd * 0.5));

      // CONFINEMENT : hors du polygone de diffusion, ou dissipée, la bouffée
      // renaît à la source. C'est ici, et nulle part ailleurs, que se joue la
      // promesse du lot.
      if (this.life[i] >= 1 || !inRing(this.ring, this.ringLen, this.px[i], this.py[i])) {
        this.respawn(i);
        continue;
      }

      // Proximité du bord : quatre sondes à la distance du rayon de la bouffée.
      // Chacune hors du gabarit ampute d'un quart l'opacité — la bouffée
      // s'efface progressivement au lieu de déborder.
      // Le rayon de la sonde suit la taille RÉELLE de la bouffée, qui quadruple
      // avec l'âge (même formule que le nuanceur). Une sonde à rayon fixe
      // laissait déborder les vieilles bouffées, les plus grandes — et donc les
      // plus visibles.
      const rad = this.spriteMerc * (0.5 + 3.5 * this.life[i]) * (0.75 + sd * 0.5);
      let inside = 0;
      for (let q = 0; q < 4; q++) {
        const ang = (q * Math.PI) / 2;
        if (inRing(this.ring, this.ringLen, this.px[i] + Math.cos(ang) * rad, this.py[i] + Math.sin(ang) * rad)) {
          inside++;
        }
      }

      const k = n * 5;
      this.vertexData[k] = this.px[i];
      this.vertexData[k + 1] = this.py[i];
      this.vertexData[k + 2] = this.life[i];
      this.vertexData[k + 3] = sd;
      this.vertexData[k + 4] = inside / 4;
      n++;
    }

    if (n > 0) {
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.subarray(0, n * 5), gl.DYNAMIC_DRAW);

      const stride = 5 * 4;
      const bind = (name: string, size: number, offset: number) => {
        const loc = gl.getAttribLocation(this.program!, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
      };
      bind("a_pos", 2, 0);
      bind("a_life", 1, 8);
      bind("a_seed", 1, 12);
      bind("a_edge", 1, 16);

      gl.uniformMatrix4fv(gl.getUniformLocation(this.program, "u_matrix"), false, matrix as Float32Array);
      gl.uniform3fv(gl.getUniformLocation(this.program, "u_core"), this.core);
      gl.uniform3fv(gl.getUniformLocation(this.program, "u_tail"), this.tail);
      gl.uniform1f(gl.getUniformLocation(this.program, "u_opacity"), this.opacity);
      // TAILLE CALÉE SUR L'EMPRISE DU GABARIT À L'ÉCRAN, pas sur une courbe de
      // zoom arbitraire.
      //
      // C'est le défaut qui faisait disparaître le nuage pendant la lecture : la
      // caméra de théâtre zoome à 11,5, le gabarit occupait alors tout l'écran,
      // et les bouffées restaient à 10 px — trois mille grains épars sur une
      // nappe de 400 px, autant dire rien.
      //
      // Une unité mercator vaut 512 × 2^zoom pixels. La bouffée fait un dixième
      // de l'emprise : la nappe se couvre à toute échelle, du périmètre de
      // 300 m au panache de 10 km.
      const z = this.map?.getZoom() ?? 10;
      const extentPx = this.extent * 512 * Math.pow(2, z);
      gl.uniform1f(gl.getUniformLocation(this.program, "u_scale"), Math.max(12, Math.min(220, extentPx / 10)));

      gl.enable(gl.BLEND);
      // Mélange classique, NON additif : l'additif vire au blanc lumineux et
      // ferait lire un incendie là où il s'agit d'un nuage toxique.
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArrays(gl.POINTS, 0, n);
    }

    this.onNeedsRepaint();
  }
}
