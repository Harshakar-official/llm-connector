package websocket

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	gorilla "github.com/gorilla/websocket"

	"github.com/llmconnector/connector/internal/models"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	maxMessageSize = 1 << 20 // 1 MB
)

// MessageHandler is called when a WebSocket message is received.
type MessageHandler func(msg models.WSMessage)

// ConnectHandler is called when the WebSocket connects or disconnects.
type ConnectHandler func(connected bool)

// Client manages the WebSocket connection to the cloud platform.
type Client struct {
	serverURL     string
	apiKey        string
	connID        string
	dialer        *gorilla.Dialer
	handler       MessageHandler
	onConnect     ConnectHandler
	tlsConfig     *tls.Config

	mu   sync.Mutex
	conn *gorilla.Conn
}

// New creates a new WebSocket client.
func New(serverURL, apiKey, connID string, handler MessageHandler) *Client {
	return &Client{
		serverURL: serverURL,
		apiKey:    apiKey,
		connID:    connID,
		dialer:    &gorilla.Dialer{HandshakeTimeout: 10 * time.Second},
		handler:   handler,
	}
}

// SetTLSConfig sets the TLS config for the WebSocket dialer.
// Must be called before Connect.
func (c *Client) SetTLSConfig(tc *tls.Config) {
	c.tlsConfig = tc
}

// OnConnect registers a callback for connection state changes.
func (c *Client) OnConnect(fn ConnectHandler) {
	c.onConnect = fn
}

// IsConnected returns true if the WebSocket is currently connected.
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// Connect establishes the WebSocket connection and starts the read pump.
// Blocks until the context is cancelled or the connection is permanently lost.
func (c *Client) Connect(ctx context.Context, reconnectDelay time.Duration) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		url := fmt.Sprintf("%s/ws?connector_id=%s", c.serverURL, c.connID)
		header := http.Header{}
		header.Set("Authorization", "Bearer "+c.apiKey)

		// apply TLS config if set
		dialer := c.dialer
		if c.tlsConfig != nil {
			dialer = &gorilla.Dialer{
				HandshakeTimeout:  10 * time.Second,
				TLSClientConfig:   c.tlsConfig,
			}
		}

		conn, _, err := dialer.Dial(url, header)
		if err != nil {
			slog.Warn("websocket dial failed", "error", err, "retry_in", reconnectDelay)
			select {
			case <-ctx.Done():
				return
			case <-time.After(reconnectDelay):
			}
			continue
		}

		slog.Info("websocket connected", "server", c.serverURL)
		conn.SetPongHandler(func(string) error {
			_ = conn.SetReadDeadline(time.Now().Add(pongWait))
			return nil
		})

		c.mu.Lock()
		c.conn = conn
		c.mu.Unlock()

		if c.onConnect != nil {
			c.onConnect(true)
		}

		c.readPump(ctx, conn)

		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		conn.Close()

		if c.onConnect != nil {
			c.onConnect(false)
		}

		slog.Info("websocket disconnected", "reconnect_in", reconnectDelay)
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}
	}
}

// SendMessage sends a message over the active WebSocket connection.
func (c *Client) SendMessage(msg models.WSMessage) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return fmt.Errorf("no active websocket connection")
	}

	_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
	return conn.WriteJSON(msg)
}

func (c *Client) readPump(ctx context.Context, conn *gorilla.Conn) {
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetReadLimit(maxMessageSize)

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		_, data, err := conn.ReadMessage()
		if err != nil {
			if gorilla.IsUnexpectedCloseError(err,
				gorilla.CloseGoingAway, gorilla.CloseNormalClosure) {
				slog.Warn("websocket read error", "error", err)
			}
			return
		}

		var msg models.WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			slog.Warn("invalid websocket message", "error", err)
			continue
		}

		if c.handler != nil {
			c.handler(msg)
		}
	}
}
