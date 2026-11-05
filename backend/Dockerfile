# syntax=docker/dockerfile:1.7

FROM golang:1.27-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS build

WORKDIR /src
COPY backend/go.mod ./
COPY backend/cmd ./cmd
COPY backend/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -buildvcs=false -ldflags='-s -w' -o /out/anchor-management ./cmd/server

FROM node:24.22.1-alpine3.23@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2

# Node is needed only to execute the trusted rules helper. Remove package
# managers from the runtime image and run the service as an unprivileged user.
RUN apk upgrade --no-cache \
    && addgroup -S app && adduser -S -G app app \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
    && mkdir -p /data \
    && chown app:app /data
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/tmp \
    NODE_NO_WARNINGS=1
COPY --from=build --chown=app:app --chmod=0555 /out/anchor-management /app/anchor-management
COPY --chown=app:app --chmod=0444 backend/data/seed.json /app/data/seed.json
COPY --chown=app:app --chmod=0444 index.html frontend-config.js /app/static/
COPY --chown=app:app --chmod=0555 backend/scripts/casrep-workflow.cjs backend/scripts/migrate-demo-traffic.cjs /app/scripts/
RUN chmod 0555 /app/data /app/static /app/scripts
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/anchor-management", "-addr", "0.0.0.0:8080", "-data", "/data/anchor-management.json", "-seed", "/app/data/seed.json", "-static", "/app/static", "-model-helper", "/app/scripts/casrep-workflow.cjs"]
