// Package stream provides an HTTP client for interacting with the go2rtc streaming server API.
package stream

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const (
	defaultGo2RTCBaseURL = "http://localhost:1984"
	defaultHTTPTimeout   = 10 * time.Second
)

// Go2RTCClient is a low-level HTTP client for the go2rtc REST API.
type Go2RTCClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewGo2RTCClient creates a new client for the go2rtc API.
// The base URL is read from the GO2RTC_API_URL environment variable,
// falling back to http://localhost:1984 if unset.
func NewGo2RTCClient() *Go2RTCClient {
	baseURL := os.Getenv("GO2RTC_API_URL")
	if baseURL == "" {
		baseURL = defaultGo2RTCBaseURL
	}
	return &Go2RTCClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: defaultHTTPTimeout,
		},
	}
}

// NewGo2RTCClientWithURL creates a new client with an explicit base URL.
func NewGo2RTCClientWithURL(baseURL string) *Go2RTCClient {
	return &Go2RTCClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: defaultHTTPTimeout,
		},
	}
}

// StreamInfo represents the JSON response from go2rtc for a single stream.
type StreamInfo struct {
	Name      string        `json:"name"`
	URL       string        `json:"url,omitempty"`
	Producers []interface{} `json:"producers,omitempty"`
	Consumers []interface{} `json:"consumers,omitempty"`
}

// doRequest executes an HTTP request and returns the response body.
// It propagates context cancellation and wraps errors with additional context.
func (c *Go2RTCClient) doRequest(ctx context.Context, method, path string, body interface{}) ([]byte, int, error) {
	var reqBody io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("go2rtc: marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(data)
	}

	url := c.baseURL + path
	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return nil, 0, fmt.Errorf("go2rtc: create request %s %s: %w", method, path, err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("go2rtc: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("go2rtc: read response %s %s: %w", method, path, err)
	}

	if resp.StatusCode >= 400 {
		return respBody, resp.StatusCode, fmt.Errorf("go2rtc: %s %s returned %d: %s", method, path, resp.StatusCode, string(respBody))
	}

	return respBody, resp.StatusCode, nil
}

// Get performs a GET request to the given path and decodes the JSON response into dest.
func (c *Go2RTCClient) Get(ctx context.Context, path string, dest interface{}) error {
	data, _, err := c.doRequest(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	if dest != nil {
		if err := json.Unmarshal(data, dest); err != nil {
			return fmt.Errorf("go2rtc: decode response for GET %s: %w", path, err)
		}
	}
	return nil
}

// Post performs a POST request to the given path with the provided body.
func (c *Go2RTCClient) Post(ctx context.Context, path string, body interface{}) error {
	_, _, err := c.doRequest(ctx, http.MethodPost, path, body)
	return err
}

// Put performs a PUT request to the given path with the provided body.
func (c *Go2RTCClient) Put(ctx context.Context, path string, body interface{}) error {
	_, _, err := c.doRequest(ctx, http.MethodPut, path, body)
	return err
}

// Delete performs a DELETE request to the given path.
func (c *Go2RTCClient) Delete(ctx context.Context, path string) error {
	_, _, err := c.doRequest(ctx, http.MethodDelete, path, nil)
	return err
}

// BaseURL returns the configured go2rtc base URL.
func (c *Go2RTCClient) BaseURL() string {
	return c.baseURL
}
