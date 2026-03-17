FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/camera-ingest ./cmd/server/

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata ffmpeg
RUN addgroup -S osp && adduser -S osp -G osp

COPY --from=builder /bin/camera-ingest /usr/local/bin/camera-ingest

USER osp
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["camera-ingest"]
