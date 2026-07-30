package utils

import (
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"
	"time"
)

// ParsePorts parses a comma-separated list of ports and ranges.
// Examples: "11434,8080,8000" or "3000-3010" or "11434,8080,3000-3010".
// Returns a sorted unique list of ports.
func ParsePorts(s string) ([]int, error) {
	parts := strings.Split(s, ",")
	seen := map[int]bool{}
	var result []int

	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}

		if strings.Contains(p, "-") {
			parts := strings.SplitN(p, "-", 2)
			if len(parts) != 2 {
				return nil, fmt.Errorf("invalid port range: %s", p)
			}
			start, err := strconv.Atoi(strings.TrimSpace(parts[0]))
			if err != nil {
				return nil, fmt.Errorf("invalid port range start: %s", parts[0])
			}
			end, err := strconv.Atoi(strings.TrimSpace(parts[1]))
			if err != nil {
				return nil, fmt.Errorf("invalid port range end: %s", parts[1])
			}
			if start < 1 || end > 65535 || start > end {
				return nil, fmt.Errorf("invalid port range: %d-%d", start, end)
			}
			for port := start; port <= end; port++ {
				if !seen[port] {
					seen[port] = true
					result = append(result, port)
				}
			}
		} else {
			port, err := strconv.Atoi(p)
			if err != nil {
				return nil, fmt.Errorf("invalid port: %s", p)
			}
			if port < 1 || port > 65535 {
				return nil, fmt.Errorf("port out of range: %d", port)
			}
			if !seen[port] {
				seen[port] = true
				result = append(result, port)
			}
		}
	}

	sort.Ints(result)
	return result, nil
}

// TCPPortOpen checks if a TCP port is accepting connections.
// Returns true if the port is open.
func TCPPortOpen(addr string, port int, timeout time.Duration) bool {
	target := net.JoinHostPort(addr, strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", target, timeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}
