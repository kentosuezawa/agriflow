# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --ignore-scripts --no-audit --no-fund && npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund
ENV NODE_ENV=production AGRIFLOW_CONTAINER=1 AGRIFLOW_HOST=0.0.0.0
USER node
EXPOSE 3000
CMD ["node","src/server.js"]
