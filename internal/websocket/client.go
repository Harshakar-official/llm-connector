package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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

// Client manages the WebSocket connection to the cloud platform.
type Client struct {
	serverURL string
	apiKey    string
	connID    string
	dialer    *gorilla.Dialer

	handler MessageHandler

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

		conn, _, err := c.dialer.Dial(url, header)
		if err != nil {
			log.Printf("websocket dial failed: %v (retry in %v)", err, reconnectDelay)
			select {
			case <-ctx.Done():
				return
			case <-time.After(reconnectDelay):
			}
			continue
		}

		log.Printf("websocket connected to %s", url)
		conn.SetPongHandler(func(string) error {
			_ = conn.SetReadDeadline(time.Now().Add(pongWait))
			return nil
		})

		c.mu.Lock()
		c.conn = conn
		c.mu.Unlock()

		c.readPump(ctx, conn)

		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		conn.Close()

		log.Printf("websocket disconnected, reconnecting in %v", reconnectDelay)
		select {
		case <-ctx.Done():
			return
		case <-time.After(reconnectDelay):
		}
	}
}

// IsConnected returns true if the WebSocket is currently connected.
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// SendMessage sends a message over the active WebSocket connection.
// Returns nil if the message was written successfully.
// Returns an error if there is no active connection.
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
				log.Printf("websocket read error: %v", err)
			}
			return
		}

		var msg models.WSMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			log.Printf("invalid websocket message: %v", err)
			continue
		}

		if c.handler != nil {
			c.handler(msg)
		}
	}
}
