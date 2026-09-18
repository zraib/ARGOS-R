# syntax=docker/dockerfile:1.7
# ============================================================================
# ARGOS — image du poste de commandement web (Next.js, sortie « standalone »)
#
# Les variables NEXT_PUBLIC_* sont FIGÉES À LA CONSTRUCTION (Next les inline
# dans le bundle envoyé au navigateur). Le déploiement les règle en valeurs
# RELATIVES (`same-origin`, `/tiles`, `/routing`, `/llm`) : tout passe par le
# reverse proxy de la station, et l'image reste valable quelle que soit
# l'adresse IP ou le nom d'hôte sous lequel on la sert.
#
#   docker build -t argos-web -f apps/web/Dockerfile apps/web
# ============================================================================

ARG NODE_IMAGE=node:22-alpine

# --- 1. dépendances ---------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# .npmrc : n'installe pas la dépendance de pair du greffon RTL (voir le fichier).
COPY package.json package-lock.json .npmrc ./
# Cache npm partagé entre les constructions (montage BuildKit) et téléchargements
# patients : une coupure réseau en cours d'installation (ECONNRESET) se rejoue
# sur ce qui manque au lieu de repartir de zéro — décisif pour une image amd64
# fabriquée sous émulation, où l'installation dure longtemps.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --fetch-retries=6 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=180000 --fetch-timeout=900000

# --- 2. construction --------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Réglages du navigateur, tous relatifs par défaut (voir deploy/.env.example).
ARG NEXT_PUBLIC_API_URL=same-origin
ARG NEXT_PUBLIC_MAP_TILES=sovereign
ARG NEXT_PUBLIC_TILES_URL=/tiles
ARG NEXT_PUBLIC_ROUTING_ENGINE=valhalla
ARG NEXT_PUBLIC_ROUTING_URL=/routing
ARG NEXT_PUBLIC_LLM_URL=/llm
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_MAP_TILES=${NEXT_PUBLIC_MAP_TILES} \
    NEXT_PUBLIC_TILES_URL=${NEXT_PUBLIC_TILES_URL} \
    NEXT_PUBLIC_ROUTING_ENGINE=${NEXT_PUBLIC_ROUTING_ENGINE} \
    NEXT_PUBLIC_ROUTING_URL=${NEXT_PUBLIC_ROUTING_URL} \
    NEXT_PUBLIC_LLM_URL=${NEXT_PUBLIC_LLM_URL} \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN npm run build

# --- 3. exécution -----------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3004 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup -g 1001 -S argos && adduser -S -u 1001 -G argos argos
# La sortie standalone contient server.js et le strict nécessaire de
# node_modules ; les ressources statiques et public/ s'y ajoutent à côté.
COPY --from=build --chown=argos:argos /app/.next/standalone ./
COPY --from=build --chown=argos:argos /app/.next/static ./.next/static
COPY --from=build --chown=argos:argos /app/public ./public
USER argos
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1
CMD ["node", "server.js"]
