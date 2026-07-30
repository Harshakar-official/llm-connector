package utils

import (
	"fmt"
	"testing"
)

func TestParsePorts(t *testing.T) {
	tests := []struct {
		input string
		want  string
		err   bool
	}{
		{"11434", "[11434]", false},
		{"11434,8080", "[8080 11434]", false},
		{"3000-3003", "[3000 3001 3002 3003]", false},
		{"11434,8080,3000-3002", "[3000 3001 3002 8080 11434]", false},
		{"", "[]", false},
		{"99999", "", true},
		{"abc", "", true},
		{"3000-2999", "", true},
	}
	for _, tt := range tests {
		got, err := ParsePorts(tt.input)
		if tt.err {
			if err == nil {
				t.Errorf("ParsePorts(%q) expected error, got %v", tt.input, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParsePorts(%q) unexpected error: %v", tt.input, err)
			continue
		}
		gotStr := fmt.Sprintf("%v", got)
		if gotStr != tt.want {
			t.Errorf("ParsePorts(%q) = %v, want %s", tt.input, got, tt.want)
		}
	}
}
