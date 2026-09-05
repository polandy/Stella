# syntax=docker/dockerfile:1

# --- Build stage: install everything and build the SvelteKit server ---
FROM oven/bun:1.3.13-slim AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# --- Runtime stage: production deps only + the built server ---
FROM oven/bun:1.3.13-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/stella.db \
    MEDIA_DIR=/data/media \
    # Uploads (Monica dumps, photos) exceed adapter-node's 512 KB default.
    BODY_SIZE_LIMIT=25M

# Only production dependencies are needed to run the adapter-node output.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# The built server and the migrations it applies on startup.
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle

# Persistent state (SQLite file + media) lives on a mounted volume.
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000

# Liveness check uses Bun itself, so no extra tools are needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD bun -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "./build/index.js"]
