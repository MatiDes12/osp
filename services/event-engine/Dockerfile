FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/event-engine ./cmd/server/

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
RUN addgroup -S osp && adduser -S osp -G osp

COPY --from=builder /bin/event-engine /usr/local/bin/event-engine

USER osp
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8082/health || exit 1

ENTRYPOINT ["event-engine"]
