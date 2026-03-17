package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// SpoolEntry represents a pending upload from the local spool.
type SpoolEntry struct {
	LocalDir    string `json:"local_dir"`
	R2Prefix    string `json:"r2_prefix"`
	CreatedAt   string `json:"created_at"`
	RetryCount  int    `json:"retry_count"`
}

// SpoolManager manages a local disk spool for failed R2 uploads.
type SpoolManager struct {
	spoolDir  string
	maxBytes  int64
	r2        *R2Storage
	mu        sync.Mutex
}

// NewSpoolManager creates a new SpoolManager.
func NewSpoolManager(spoolDir string, maxBytes int64, r2 *R2Storage) (*SpoolManager, error) {
	if err := os.MkdirAll(spoolDir, 0o755); err != nil {
		return nil, fmt.Errorf("create spool dir: %w", err)
	}
	return &SpoolManager{
		spoolDir: spoolDir,
		maxBytes: maxBytes,
		r2:       r2,
	}, nil
}

// Spool saves a mapping from a local directory to an R2 prefix for later retry.
func (s *SpoolManager) Spool(localDir, r2Prefix string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	used, _ := s.diskUsage()
	if used >= s.maxBytes {
		return fmt.Errorf("spool full: %d/%d bytes used", used, s.maxBytes)
	}

	entry := SpoolEntry{
		LocalDir:   localDir,
		R2Prefix:   r2Prefix,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		RetryCount: 0,
	}

	data, err := json.Marshal(entry)
	if err != nil {
		return fmt.Errorf("marshal spool entry: %w", err)
	}

	filename := fmt.Sprintf("%d.spool.json", time.Now().UnixNano())
	path := filepath.Join(s.spoolDir, filename)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write spool entry: %w", err)
	}

	log.Printf("spooled upload: %s -> %s", localDir, r2Prefix)
	return nil
}

// Drain processes all pending spool entries, retrying uploads to R2.
// It runs as a background goroutine and processes entries every interval.
func (s *SpoolManager) Drain(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("spool drain stopped")
			return
		case <-ticker.C:
			s.drainOnce(ctx)
		}
	}
}

func (s *SpoolManager) drainOnce(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entries, err := os.ReadDir(s.spoolDir)
	if err != nil {
		log.Printf("spool drain: read dir error: %v", err)
		return
	}

	for _, dirEntry := range entries {
		if dirEntry.IsDir() || filepath.Ext(dirEntry.Name()) != ".json" {
			continue
		}

		path := filepath.Join(s.spoolDir, dirEntry.Name())
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("spool drain: read %s error: %v", path, err)
			continue
		}

		var entry SpoolEntry
		if err := json.Unmarshal(data, &entry); err != nil {
			log.Printf("spool drain: unmarshal %s error: %v", path, err)
			continue
		}

		if err := s.r2.UploadDirectory(ctx, entry.LocalDir, entry.R2Prefix); err != nil {
			entry.RetryCount++
			log.Printf("spool drain: upload retry %d failed for %s: %v", entry.RetryCount, entry.R2Prefix, err)

			// Update the retry count.
			updated, _ := json.Marshal(entry)
			_ = os.WriteFile(path, updated, 0o644)
			continue
		}

		// Upload succeeded: remove spool entry and local files.
		log.Printf("spool drain: successfully uploaded %s", entry.R2Prefix)
		_ = os.Remove(path)
		_ = os.RemoveAll(entry.LocalDir)
	}
}

// GetUsage returns the current and maximum spool disk usage in bytes.
func (s *SpoolManager) GetUsage() (usedBytes, maxBytes int64) {
	used, _ := s.diskUsage()
	return used, s.maxBytes
}

// diskUsage calculates total bytes used by files in the spool directory.
func (s *SpoolManager) diskUsage() (int64, error) {
	var total int64
	err := filepath.WalkDir(s.spoolDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			info, err := d.Info()
			if err != nil {
				return err
			}
			total += info.Size()
		}
		return nil
	})
	return total, err
}
