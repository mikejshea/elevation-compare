# ── Build stage ───────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

WORKDIR /build

# Cache module downloads ahead of source copy.
# go.sum* glob is safe when go.sum doesn't yet exist (no external deps).
COPY backend/go.mod backend/go.sum* ./
RUN go mod download

COPY backend/ .

RUN CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" -o server .

# ── Runtime stage ─────────────────────────────────────────────────────────
FROM alpine:3.20

RUN addgroup -S app && adduser -S app -G app

# Mirror the dev layout so http.Dir("../frontend") resolves at runtime:
#   /app/backend/server   ← binary
#   /app/frontend/        ← static files
WORKDIR /app/backend
COPY --from=builder /build/server ./server
COPY frontend/ /app/frontend/

USER app

EXPOSE 8080
CMD ["./server"]
