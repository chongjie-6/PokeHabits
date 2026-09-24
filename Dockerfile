# syntax=docker/dockerfile:1

# The self-hosting image. docker-compose.yml is the way in; docs/DEPLOYMENT.md
# says what each variable does.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# Every route prerenders, and link-preview metadata is rendered with them
# (lib/site-url.ts) — so the public origin is baked in here, not read at runtime.
ARG SITE_URL
ENV SITE_URL=$SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build && rm -rf .next/cache

# drizzle-kit is a dev dependency, so migrations run from the full install and
# the image that serves traffic never carries it.
FROM deps AS migrate
COPY . .
CMD ["npm", "run", "db:migrate"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
