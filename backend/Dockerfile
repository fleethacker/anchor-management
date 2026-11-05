# syntax=docker/dockerfile:1.7

FROM golang:1.27-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS build

WORKDIR /src
COPY backend/go.mod ./
COPY backend/cmd ./cmd
COPY backend/internal ./internal
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -buildvcs=false -ldflags='-s -w' -o /out/anchor-management ./cmd/server

FROM alpine:3.23 AS llama-build
ARG LLAMA_CPP_COMMIT=e30ad80fd7fa09a858bf8b8f4118e6479809486e
RUN apk add --no-cache build-base ccache cmake git linux-headers
RUN git init /src/llama.cpp \
    && git -C /src/llama.cpp remote add origin https://github.com/ggml-org/llama.cpp.git \
    && git -C /src/llama.cpp -c protocol.version=2 fetch --depth=1 --filter=blob:none --no-tags origin "$LLAMA_CPP_COMMIT" \
    && git -C /src/llama.cpp checkout --detach FETCH_HEAD
RUN --mount=type=cache,id=anchor-management-llama-ccache,target=/root/.cache/ccache \
    cmake -S /src/llama.cpp -B /src/llama.cpp/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DGGML_NATIVE=OFF \
      -DGGML_OPENMP=OFF \
      -DCMAKE_C_COMPILER_LAUNCHER=ccache \
      -DCMAKE_CXX_COMPILER_LAUNCHER=ccache \
      -DLLAMA_BUILD_SERVER=ON \
      -DLLAMA_BUILD_UI=OFF \
      -DLLAMA_USE_PREBUILT_UI=OFF \
      -DLLAMA_UI_GZIP=OFF \
      -DLLAMA_BUILD_TESTS=OFF \
      -DLLAMA_BUILD_EXAMPLES=OFF \
    && cmake --build /src/llama.cpp/build --config Release --target llama-server --parallel "$(nproc)"

FROM alpine:3.23 AS verified-model
ARG MODEL_URL=https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf
ARG MODEL_SHA256=48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201
RUN apk add --no-cache curl
RUN mkdir -p /models \
    && curl --fail --location --retry 3 --output /models/smollm2-360m-instruct-q8_0.gguf "$MODEL_URL" \
    && echo "$MODEL_SHA256  /models/smollm2-360m-instruct-q8_0.gguf" | sha256sum -c -

FROM node:24.22.1-alpine3.23@sha256:0468540aa58203ff9e40c2aab3907c52644ab818af6176b1c70a026137dc92a2

# Node is needed only to execute the trusted rules helper. Remove package
# managers from the runtime image and run the service as an unprivileged user.
RUN apk upgrade --no-cache \
    && apk add --no-cache libstdc++ \
    && addgroup -S app && adduser -S -G app app \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
    && mkdir -p /data /models \
    && chown app:app /data /models
WORKDIR /app
ENV NODE_ENV=production \
    HOME=/tmp \
    NODE_NO_WARNINGS=1 \
    LD_LIBRARY_PATH=/opt/llama/bin
COPY --from=build --chown=app:app --chmod=0555 /out/anchor-management /app/anchor-management
COPY --from=llama-build --chown=app:app --chmod=0555 /src/llama.cpp/build/bin/ /opt/llama/bin/
COPY --from=verified-model --chown=app:app --chmod=0444 /models/smollm2-360m-instruct-q8_0.gguf /models/smollm2-360m-instruct-q8_0.gguf
COPY --chown=app:app --chmod=0444 backend/data/seed.json /app/data/seed.json
COPY --chown=app:app --chmod=0444 index.html frontend-config.js /app/static/
COPY --chown=app:app --chmod=0555 backend/scripts/casrep-workflow.cjs backend/scripts/migrate-demo-traffic.cjs /app/scripts/
RUN chmod 0555 /app/data /app/static /app/scripts /models
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
STOPSIGNAL SIGTERM
ENTRYPOINT ["/app/anchor-management", "-addr", "0.0.0.0:8080", "-data", "/data/anchor-management.json", "-seed", "/app/data/seed.json", "-static", "/app/static", "-model-helper", "/app/scripts/casrep-workflow.cjs"]
