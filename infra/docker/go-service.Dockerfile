# Multi-stage Dockerfile for OSP Go services
# Usage: docker build --build-arg SERVICE_NAME=camera-ingest .

ARG SERVICE_NAME

# ─── Stage 1: Build ───
FROM golang:1.22-alpine AS builder

ARG SERVICE_NAME

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /src

# Cache dependency downloads
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the service binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /bin/service \
    ./cmd/server

# ─── Stage 2: Runtime ───
FROM alpine:latest

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /bin/service /usr/local/bin/service

# Run as non-root
RUN addgroup -S osp && adduser -S osp -G osp
USER osp

ENTRYPOINT ["/usr/local/bin/service"]
