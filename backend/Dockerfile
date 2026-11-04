FROM golang:1.22-alpine AS build

WORKDIR /src
COPY backend/go.mod ./
COPY backend/cmd ./cmd
COPY backend/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/anchor-management ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache nodejs && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build /out/anchor-management /app/anchor-management
COPY backend/data/seed.json /app/data/seed.json
COPY index.html frontend-config.js /app/static/
COPY backend/scripts/casrep-workflow.cjs /app/scripts/casrep-workflow.cjs
RUN mkdir -p /data && chown -R app:app /app /data
USER app
EXPOSE 8080
ENTRYPOINT ["/app/anchor-management", "-addr", "0.0.0.0:8080", "-data", "/data/anchor-management.json", "-seed", "/app/data/seed.json", "-static", "/app/static", "-model-helper", "/app/scripts/casrep-workflow.cjs"]
