FROM oven/bun:1-alpine AS web-build
WORKDIR /web
COPY apps/web/package.json ./
RUN bun install
COPY apps/web .
RUN bun run build

FROM oven/bun:1-alpine AS api-build
WORKDIR /app
COPY apps/api/package.json ./
RUN bun install --production
COPY apps/api .
RUN bun build --compile --minify src/cli.ts --outfile kuberfy

FROM alpine:3.20
RUN apk add --no-cache ca-certificates libstdc++ libgcc git \
    && addgroup -g 1000 kuberfy && adduser -D -u 1000 -G kuberfy kuberfy
WORKDIR /app
COPY --from=api-build /app/kuberfy ./kuberfy
COPY apps/api/drizzle ./drizzle
COPY --from=web-build /web/dist ./public
# A named volume mounted over this path inherits its ownership on first creation — pre-chown so the non-root
# user below can write to it without an entrypoint script.
RUN mkdir -p /data && chown -R kuberfy:kuberfy /app /data

ENV DATABASE_PATH=/data/kuberfy.db
VOLUME /data
EXPOSE 3000
USER kuberfy
CMD ["sh", "-c", "./kuberfy migrate && ./kuberfy server"]
