FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --workspace @mayraviq/web --include-workspace-root
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build:web

FROM nginxinc/nginx-unprivileged:1.29-alpine
USER root
RUN apk add --no-cache jq
COPY infra/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh && chown -R 101:101 /usr/share/nginx/html
USER 101
ENV API_UPSTREAM=api:4000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1:8080/health
