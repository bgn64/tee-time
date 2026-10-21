FROM node:22.20.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS tools
COPY supabase/config.toml ./supabase/config.toml
COPY supabase/migrations ./supabase/migrations
COPY deploy/self-hosted/migrate.sh deploy/self-hosted/validate-env.mjs ./deploy/self-hosted/
ENTRYPOINT ["/bin/sh", "/app/deploy/self-hosted/migrate.sh"]

FROM dependencies AS build
COPY app.json babel.config.js metro.config.js tsconfig.json process-env.d.ts ./
COPY src ./src
COPY assets ./assets
ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ENV CI=1 EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1
RUN test -n "$EXPO_PUBLIC_SUPABASE_URL" && test -n "$EXPO_PUBLIC_SUPABASE_ANON_KEY" \
    && npx --no-install expo export --platform web

FROM nginx:1.28.0-alpine AS web
COPY deploy/self-hosted/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY supabase/templates/magic-link.html /usr/share/nginx/html/auth-email.html
EXPOSE 80 81
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
