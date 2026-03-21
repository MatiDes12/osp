FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/edge-agent ./cmd/server

# ─────────────────────────────────────────────────────────────────────────────

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

RUN addgroup -S osp && adduser -S osp -G osp

# Data volume for BoltDB offline queue + snapshots
RUN mkdir -p /data && chown osp:osp /data

COPY --from=builder /bin/edge-agent /usr/local/bin/edge-agent

USER osp

EXPOSE 8084

VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8084/health || exit 1

ENTRYPOINT ["edge-agent"]
