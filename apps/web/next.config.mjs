// ============================================================================
// ARGOS — configuration Next.js
//
// La CSP est le MÉCANISME D'APPLICATION de la souveraineté (ADR 0006,
// MASTER_PLAN §4.3). Sans elle, « pas d'appel externe » n'est qu'une
// convention que le prochain commit peut contourner sans bruit ; avec elle,
// le navigateur refuse la connexion et la violation apparaît en console.
// ============================================================================

/**
 * Mode des tuiles — doit rester cohérent avec `src/lib/map/tiles.ts` : seule la
 * valeur explicite `external` ouvre les fournisseurs (en production aussi,
 * quand la station l'a choisi — ADR 0014) ; vide vaut externe en développement
 * et souverain en production ; tout le reste ferme.
 */
const IS_PROD = process.env.NODE_ENV === "production";
const demandeTuiles = (process.env.NEXT_PUBLIC_MAP_TILES ?? "").trim();
const TILES_MODE = demandeTuiles === "external" ? "external" : demandeTuiles === "" && !IS_PROD ? "external" : "sovereign";

/** Hôtes de tuiles externes — ouverts dans la CSP en mode `external` seulement. */
const EXTERNAL_TILE_HOSTS = [
  "https://server.arcgisonline.com",
  "https://tiles.openfreemap.org",
  "https://s3.amazonaws.com",
];

/**
 * En mode souverain, seule l'ORIGINE du serveur de tuiles auto-hébergé est
 * admise (`NEXT_PUBLIC_TILES_URL`, martin derrière Traefik). Sans URL : aucun
 * hôte — la carte reste sans fond, la politique reste fermée.
 */
const sovereignTileOrigin = (() => {
  try {
    return TILES_MODE === "sovereign" && process.env.NEXT_PUBLIC_TILES_URL ? new URL(process.env.NEXT_PUBLIC_TILES_URL).origin : "";
  } catch {
    return "";
  }
})();
const tileHosts = TILES_MODE === "external" ? EXTERNAL_TILE_HOSTS : [sovereignTileOrigin].filter(Boolean);

/**
 * `connect-src` : l'API ARGOS n'est PAS same-origin (web 3004, API 3005), il
 * faut donc l'autoriser explicitement. En développement on tolère largement
 * localhost et le LAN privé (moteurs LLM locaux, API servie sur l'IP de la
 * machine, websocket HMR) ; en production, seule l'origine de l'API déclarée
 * est admise.
 */
// `same-origin` (déploiement derrière le reverse proxy) : l'API est servie sous
// la même origine que la page, `'self'` suffit — aucun hôte à ajouter.
const apiOrigin = (() => {
  const v = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  if (!v || v === "same-origin") return "";
  try {
    return new URL(v).origin;
  } catch {
    return "";
  }
})();
// Le moteur de langage local (Ollama). Relatif (`/llm`, via le proxy) : rien à
// ouvrir ; absolu (`http://127.0.0.1:11434` sur le poste du développeur) :
// son origine, et elle seule.
const llmOrigin = (() => {
  const v = (process.env.NEXT_PUBLIC_LLM_URL ?? "").trim();
  if (!v || v.startsWith("/")) return "";
  try {
    return new URL(v).origin;
  } catch {
    return "";
  }
})();
//
// La CSP n'autorise le joker QUE comme premier label de domaine (`*.exemple.fr`)
// — `http://192.168.*:*` est une source INVALIDE, silencieusement ignorée par le
// navigateur. Or l'API est servie sur l'IP LAN de la machine en développement
// (test depuis un téléphone), adresse qu'aucune règle CSP ne sait décrire.
// En dev on autorise donc les SCHÉMAS `http:` et `ws:` : la politique de
// développement vérifie la FORME de la CSP, elle n'est pas la frontière de
// sécurité. La frontière, c'est la politique de production, exacte et stricte.
// MapLibre charge ses tuiles par `fetch` (pas par <img>) : les hôtes de tuiles
// vont dans `connect-src` autant que dans `img-src`.
const connectSrc = IS_PROD
  ? ["'self'", apiOrigin, ...tileHosts, llmOrigin].filter(Boolean)
  : ["'self'", "http:", "https:", "ws:", "wss:"];

/**
 * `script-src` : Next injecte des scripts en ligne pour l'hydratation, et le
 * mode dev exige `unsafe-eval` (HMR / React Refresh).
 *
 * HONNÊTETÉ SUR LA PORTÉE : `'unsafe-inline'` en production affaiblit la
 * protection contre le XSS. Le durcir suppose une CSP à nonce, donc un
 * middleware Next — travail distinct, hors de la phase 1. Cette phase traite
 * l'EXFILTRATION (`connect-src`, `img-src`), pas l'injection de script.
 */
// `'wasm-unsafe-eval'` : n'autorise QUE la compilation WebAssembly — celle du
// greffon RTL auto-hébergé (`public/vendor/mapbox-gl-rtl-text.js`, ADR 0014)
// qui met en forme l'arabe des étiquettes dans le worker de la carte. Sans lui,
// MapLibre retient toutes les étiquettes des tuiles qui portent de l'arabe :
// la carte du Maroc n'aurait plus un seul nom. Aucune évaluation de JS n'est
// ouverte par ce mot-clé.
const scriptSrc = IS_PROD
  ? ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]
  : ["'self'", "'unsafe-inline'", "'unsafe-eval'"];

const csp = [
  `default-src 'self'`,
  `script-src ${scriptSrc.join(" ")}`,
  // Tailwind et MapLibre posent des styles en ligne.
  `style-src 'self' 'unsafe-inline'`,
  // Polices AUTO-HÉBERGÉES uniquement (public/fonts) — aucun CDN.
  `font-src 'self'`,
  // `blob:` et `data:` : tuiles décodées et icônes générées côté client.
  `img-src 'self' data: blob: ${tileHosts.join(" ")}`.trim(),
  `connect-src ${connectSrc.join(" ")}`,
  // MapLibre exécute ses workers depuis un blob.
  `worker-src 'self' blob:`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  // Aucune mise en cadre : le poste de commandement ne s'embarque pas.
  `frame-ancestors 'none'`,
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sortie autonome : `.next/standalone/server.js` + le strict nécessaire de
  // node_modules — ce que l'image Docker copie (apps/web/Dockerfile).
  output: "standalone",
  transpilePackages: ["maplibre-gl"],
  // Autorise l'accès aux ressources de dev (HMR) depuis l'aperçu navigateur
  // servi sur 127.0.0.1 en plus de localhost (Next 16 bloque par défaut).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
