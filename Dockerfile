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
RUN bun build --compile --minify src/index.ts --outfile server
RUN bun build --compile --minify src/db/migrate.ts --outfile migrate

FROM alpine:3.20
RUN apk add --no-cache ca-certificates libstdc++ libgcc
WORKDIR /app
COPY --from=api-build /app/server ./server
COPY --from=api-build /app/migrate ./migrate
COPY apps/api/drizzle ./drizzle
COPY --from=web-build /web/dist ./public

ENV DATABASE_PATH=/data/kuberfy.db
VOLUME /data
EXPOSE 3000
CMD ["sh", "-c", "./migrate && ./server"]
