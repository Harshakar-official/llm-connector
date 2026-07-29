package metrics

import (
	"fmt"
	"io"
	"sync"
	"sync/atomic"
)

// Counter is an atomic monotonic counter with labels.
type Counter struct {
	name   string
	help   string
	value  atomic.Int64
}

// Gauge is an atomic gauge (up/down) with labels.
type Gauge struct {
	name  string
	help  string
	value atomic.Int64
}

// Registry holds all metrics and can render Prometheus text format.
type Registry struct {
	mu       sync.Mutex
	counters []*Counter
	gauges   []*Gauge
}

var global = &Registry{}

// NewCounter registers a counter.
func NewCounter(name, help string) *Counter {
	c := &Counter{name: name, help: help}
	global.mu.Lock()
	global.counters = append(global.counters, c)
	global.mu.Unlock()
	return c
}

// NewGauge registers a gauge.
func NewGauge(name, help string) *Gauge {
	g := &Gauge{name: name, help: help}
	global.mu.Lock()
	global.gauges = append(global.gauges, g)
	global.mu.Unlock()
	return g
}

func (c *Counter) Add(n int64)   { c.value.Add(n) }
func (c *Counter) Inc()          { c.value.Add(1) }
func (c *Counter) Value() int64  { return c.value.Load() }

func (g *Gauge) Set(n int64)     { g.value.Store(n) }
func (g *Gauge) Add(n int64)     { g.value.Add(n) }
func (g *Gauge) Value() int64    { return g.value.Load() }

// Render writes all metrics in Prometheus exposition format.
func Render(w io.Writer) {
	global.mu.Lock()
	defer global.mu.Unlock()

	for _, c := range global.counters {
		fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s counter\n%s %d\n",
			c.name, c.help, c.name, c.name, c.value.Load())
	}
	for _, g := range global.gauges {
		fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s gauge\n%s %d\n",
			g.name, g.help, g.name, g.name, g.value.Load())
	}
}
