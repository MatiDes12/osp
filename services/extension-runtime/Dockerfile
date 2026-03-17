FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/extension-runtime ./cmd/server/

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
RUN addgroup -S osp && adduser -S osp -G osp

COPY --from=builder /bin/extension-runtime /usr/local/bin/extension-runtime

USER osp
EXPOSE 8083
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:8083/health || exit 1

ENTRYPOINT ["extension-runtime"]
