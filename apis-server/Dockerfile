# Build stage
# Using Go 1.24+ as required by go.mod
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install git for go mod download (some deps may need it)
RUN apk add --no-cache git

# Copy go mod files first for caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build with CGO disabled for Alpine compatibility
# VERSION can be set at build time: docker build --build-arg VERSION=1.2.3
ARG VERSION=0.1.0
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags "-X github.com/jermoo/apis/apis-server/internal/config.Version=${VERSION}" \
    -o /apis-server ./cmd/server

# Runtime stage
FROM alpine:3.20

WORKDIR /app

# Add ca-certificates for HTTPS calls and wget for health checks
RUN apk --no-cache add ca-certificates wget

# Copy binary from builder
COPY --from=builder /apis-server /app/apis-server

# Non-root user for security
RUN adduser -D -H appuser
USER appuser

EXPOSE 3000

ENTRYPOINT ["/app/apis-server"]
