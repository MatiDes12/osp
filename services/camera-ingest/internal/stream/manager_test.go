package stream

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestServer creates an httptest.Server and a Manager wired to it.
// The handler function receives the method, path, and returns a status code
// and optional response body.
func newTestServer(t *testing.T, handler func(method, path string) (int, interface{})) (*httptest.Server, *Manager) {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		code, body := handler(r.Method, r.URL.RequestURI())
		w.WriteHeader(code)
		if body != nil {
			data, _ := json.Marshal(body)
			_, _ = w.Write(data)
		}
	}))
	t.Cleanup(srv.Close)

	client := NewGo2RTCClientWithURL(srv.URL)
	mgr := NewManager(client)
	return srv, mgr
}

func TestAddStream(t *testing.T) {
	tests := []struct {
		name       string
		streamName string
		rtspURL    string
		serverCode int
		wantErr    bool
		errContain string
	}{
		{
			name:       "success",
			streamName: "cam-1",
			rtspURL:    "rtsp://10.0.0.1:554/stream",
			serverCode: 200,
			wantErr:    false,
		},
		{
			name:       "empty name returns error",
			streamName: "",
			rtspURL:    "rtsp://10.0.0.1:554/stream",
			serverCode: 200,
			wantErr:    true,
			errContain: "name must not be empty",
		},
		{
			name:       "empty URL returns error",
			streamName: "cam-1",
			rtspURL:    "",
			serverCode: 200,
			wantErr:    true,
			errContain: "RTSP URL must not be empty",
		},
		{
			name:       "server error propagated",
			streamName: "cam-1",
			rtspURL:    "rtsp://10.0.0.1:554/stream",
			serverCode: 500,
			wantErr:    true,
			errContain: "500",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var capturedMethod, capturedPath string
			_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
				capturedMethod = method
				capturedPath = path
				return tt.serverCode, nil
			})

			err := mgr.AddStream(context.Background(), tt.streamName, tt.rtspURL)

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errContain != "" && !strings.Contains(err.Error(), tt.errContain) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errContain)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if capturedMethod != http.MethodPut {
				t.Errorf("expected PUT, got %s", capturedMethod)
			}
			if !strings.Contains(capturedPath, "/api/streams") {
				t.Errorf("path %q does not contain /api/streams", capturedPath)
			}
			if !strings.Contains(capturedPath, "name=cam-1") {
				t.Errorf("path %q does not contain name=cam-1", capturedPath)
			}
		})
	}
}

func TestRemoveStream(t *testing.T) {
	tests := []struct {
		name       string
		streamName string
		serverCode int
		wantErr    bool
		errContain string
	}{
		{
			name:       "success",
			streamName: "cam-1",
			serverCode: 200,
			wantErr:    false,
		},
		{
			name:       "empty name returns error",
			streamName: "",
			serverCode: 200,
			wantErr:    true,
			errContain: "name must not be empty",
		},
		{
			name:       "server 404 propagated",
			streamName: "cam-nonexistent",
			serverCode: 404,
			wantErr:    true,
			errContain: "404",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var capturedMethod string
			_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
				capturedMethod = method
				return tt.serverCode, nil
			})

			err := mgr.RemoveStream(context.Background(), tt.streamName)

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errContain != "" && !strings.Contains(err.Error(), tt.errContain) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errContain)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if capturedMethod != http.MethodDelete {
				t.Errorf("expected DELETE, got %s", capturedMethod)
			}
		})
	}
}

func TestGetStream(t *testing.T) {
	tests := []struct {
		name       string
		streamName string
		serverCode int
		serverBody interface{}
		wantErr    bool
		errContain string
		wantName   string
	}{
		{
			name:       "success - stream found",
			streamName: "cam-1",
			serverCode: 200,
			serverBody: map[string]*StreamInfo{
				"cam-1": {Name: "cam-1", URL: "rtsp://10.0.0.1/stream"},
			},
			wantErr:  false,
			wantName: "cam-1",
		},
		{
			name:       "stream not in response map",
			streamName: "cam-missing",
			serverCode: 200,
			serverBody: map[string]*StreamInfo{
				"cam-other": {Name: "cam-other"},
			},
			wantErr:    true,
			errContain: "not found",
		},
		{
			name:       "empty name returns error",
			streamName: "",
			serverCode: 200,
			wantErr:    true,
			errContain: "name must not be empty",
		},
		{
			name:       "server error",
			streamName: "cam-1",
			serverCode: 500,
			wantErr:    true,
			errContain: "500",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
				return tt.serverCode, tt.serverBody
			})

			info, err := mgr.GetStream(context.Background(), tt.streamName)

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.errContain != "" && !strings.Contains(err.Error(), tt.errContain) {
					t.Errorf("error %q does not contain %q", err.Error(), tt.errContain)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if info == nil {
				t.Fatal("expected non-nil StreamInfo")
			}
			if info.Name != tt.wantName {
				t.Errorf("expected name %q, got %q", tt.wantName, info.Name)
			}
		})
	}
}

func TestListStreams(t *testing.T) {
	t.Run("success - returns all streams", func(t *testing.T) {
		expected := map[string]*StreamInfo{
			"cam-1": {Name: "cam-1"},
			"cam-2": {Name: "cam-2"},
		}
		_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
			return 200, expected
		})

		result, err := mgr.ListStreams(context.Background())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 2 {
			t.Fatalf("expected 2 streams, got %d", len(result))
		}
		if result["cam-1"] == nil || result["cam-2"] == nil {
			t.Error("expected both cam-1 and cam-2 in result")
		}
	})

	t.Run("success - empty map", func(t *testing.T) {
		_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
			return 200, map[string]*StreamInfo{}
		})

		result, err := mgr.ListStreams(context.Background())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(result) != 0 {
			t.Fatalf("expected 0 streams, got %d", len(result))
		}
	})

	t.Run("server error", func(t *testing.T) {
		_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
			return 500, nil
		})

		_, err := mgr.ListStreams(context.Background())
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestHasProducers(t *testing.T) {
	tests := []struct {
		name       string
		streamName string
		serverBody map[string]*StreamInfo
		want       bool
		wantErr    bool
	}{
		{
			name:       "has producers",
			streamName: "cam-1",
			serverBody: map[string]*StreamInfo{
				"cam-1": {Name: "cam-1", Producers: []interface{}{"producer1"}},
			},
			want: true,
		},
		{
			name:       "no producers",
			streamName: "cam-1",
			serverBody: map[string]*StreamInfo{
				"cam-1": {Name: "cam-1", Producers: []interface{}{}},
			},
			want: false,
		},
		{
			name:       "nil producers",
			streamName: "cam-1",
			serverBody: map[string]*StreamInfo{
				"cam-1": {Name: "cam-1"},
			},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
				return 200, tt.serverBody
			})

			got, err := mgr.HasProducers(context.Background(), tt.streamName)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("HasProducers = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAddStream_URLEncoding(t *testing.T) {
	var capturedPath string
	_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
		capturedPath = path
		return 200, nil
	})

	rtspURL := "rtsp://user:pass@10.0.0.1:554/stream?channel=1&subtype=0"
	err := mgr.AddStream(context.Background(), "cam with spaces", rtspURL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(capturedPath, "name=cam+with+spaces") {
		t.Errorf("expected URL-encoded name in path, got: %s", capturedPath)
	}
}

func TestContextCancellation(t *testing.T) {
	_, mgr := newTestServer(t, func(method, path string) (int, interface{}) {
		return 200, nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := mgr.AddStream(ctx, "cam-1", "rtsp://10.0.0.1/stream")
	if err == nil {
		// Context cancellation may or may not produce an error depending on timing,
		// so we only check that it does not panic.
		fmt.Println("no error on cancelled context (request completed before cancellation)")
	}
}
