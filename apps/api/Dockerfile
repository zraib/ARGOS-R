# syntax=docker/dockerfile:1.7
# ============================================================================
# ARGOS — image de l'API (NestJS)
#
# Trois étapes : dépendances complètes pour compiler, compilation, puis une
# image d'exécution qui ne contient que dist/, les dépendances de production,
# les migrations Drizzle et un utilisateur sans privilège. Le code est bâti
# DANS l'image : la station Windows n'a besoin ni de Node ni de npm.
#
#   docker build -t argos-api -f apps/api/Dockerfile apps/api
# ============================================================================

ARG NODE_IMAGE=node:22-alpine

# --- 1. dépendances (avec devDependencies : nest, typescript) ---------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- 2. compilation ---------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

# --- 3. exécution -----------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3005 \
    DEV_DATA_DIR=/data \
    ARGOS_ATTACHMENTS_DIR=/data/attachments
WORKDIR /app
# Utilisateur sans privilège ; /data est le volume de persistance (instantané
# JSON du domaine + pièces jointes) — voir deploy/docker-compose.yml.
RUN addgroup -g 1001 -S argos && adduser -S -u 1001 -G argos argos \
 && mkdir -p /data/attachments && chown -R argos:argos /data
COPY --from=build --chown=argos:argos /app/node_modules ./node_modules
COPY --from=build --chown=argos:argos /app/dist ./dist
COPY --chown=argos:argos package.json ./
# Migrations appliquées au démarrage quand DB_DRIVER=postgres (src/db/database.module.ts).
COPY --chown=argos:argos drizzle ./drizzle
USER argos
EXPOSE 3005
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "dist/main.js"]
