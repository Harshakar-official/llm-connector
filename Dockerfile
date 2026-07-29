FROM golang:1.21-alpine AS builder

WORKDIR /build
COPY go.mod ./
COPY internal ./internal
COPY cmd ./cmd
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o /build/connector ./cmd/connector

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=builder /build/connector .
COPY config.json .
EXPOSE 9199
ENTRYPOINT ["/app/connector"]
