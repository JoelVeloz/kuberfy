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
COPY --chown=kuberfy:kuberfy --from=api-build /app/kuberfy ./kuberfy
COPY --chown=kuberfy:kuberfy apps/api/drizzle ./drizzle
COPY --chown=kuberfy:kuberfy --from=web-build /web/dist ./public
COPY --chown=kuberfy:kuberfy --from=api-build /app/node_modules/geoip-lite/data/geoip-country.dat /app/node_modules/geoip-lite/data/geoip-country6.dat ./geoip-data/
RUN mkdir -p /data && chown kuberfy:kuberfy /app /data

ARG KUBERFY_VERSION=dev
ENV KUBERFY_VERSION=$KUBERFY_VERSION
ENV DATABASE_PATH=/data/kuberfy.db
ENV GEODATADIR=/app/geoip-data/
VOLUME /data
EXPOSE 3000
USER kuberfy
CMD ["sh", "-c", "./kuberfy migrate && ./kuberfy server"]
