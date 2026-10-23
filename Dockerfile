# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
# Route collection imports auth; use disposable build-only configuration, not real credentials.
RUN BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))")" \
    DATABASE_PATH=/tmp/build.sqlite \
    npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/app/data/tee-time.sqlite
# The administrative commands need production dependencies beyond the server's traced files.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/migrate.mts scripts/create-account.mts scripts/provision-account.mts ./scripts/
COPY --chown=node:node src/lib/auth-config.mts ./src/lib/
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
