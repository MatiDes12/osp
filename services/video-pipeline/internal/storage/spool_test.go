package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSpool_CreatesEntryFile(t *testing.T) {
	spoolDir := t.TempDir()
	mgr, err := NewSpoolManager(spoolDir, 1024*1024, nil)
	if err != nil {
		t.Fatalf("new spool manager: %v", err)
	}

	err = mgr.Spool("/tmp/recordings/rec-001", "tenants/t1/cameras/c1/2024/01/15/rec-001")
	if err != nil {
		t.Fatalf("spool: %v", err)
	}

	// Verify a .spool.json file was created.
	entries, err := os.ReadDir(spoolDir)
	if err != nil {
		t.Fatalf("read spool dir: %v", err)
	}

	if len(entries) != 1 {
		t.Fatalf("expected 1 spool entry, got %d", len(entries))
	}

	entry := entries[0]
	if !strings.HasSuffix(entry.Name(), ".spool.json") {
		t.Errorf("expected .spool.json suffix, got %s", entry.Name())
	}

	// Read and verify the content.
	data, err := os.ReadFile(filepath.Join(spoolDir, entry.Name()))
	if err != nil {
		t.Fatalf("read spool file: %v", err)
	}

	var spoolEntry SpoolEntry
	if err := json.Unmarshal(data, &spoolEntry); err != nil {
		t.Fatalf("unmarshal spool entry: %v", err)
	}

	if spoolEntry.LocalDir != "/tmp/recordings/rec-001" {
		t.Errorf("LocalDir = %q, want /tmp/recordings/rec-001", spoolEntry.LocalDir)
	}
	if spoolEntry.R2Prefix != "tenants/t1/cameras/c1/2024/01/15/rec-001" {
		t.Errorf("R2Prefix = %q", spoolEntry.R2Prefix)
	}
	if spoolEntry.RetryCount != 0 {
		t.Errorf("RetryCount = %d, want 0", spoolEntry.RetryCount)
	}
	if spoolEntry.CreatedAt == "" {
		t.Error("expected CreatedAt to be set")
	}
}

func TestSpool_MultiplEntries(t *testing.T) {
	spoolDir := t.TempDir()
	mgr, err := NewSpoolManager(spoolDir, 1024*1024, nil)
	if err != nil {
		t.Fatalf("new spool manager: %v", err)
	}

	for i := 0; i < 5; i++ {
		err := mgr.Spool("/tmp/rec-"+string(rune('0'+i)), "prefix-"+string(rune('0'+i)))
		if err != nil {
			t.Fatalf("spool entry %d: %v", i, err)
		}
	}

	entries, err := os.ReadDir(spoolDir)
	if err != nil {
		t.Fatalf("read spool dir: %v", err)
	}

	if len(entries) != 5 {
		t.Errorf("expected 5 entries, got %d", len(entries))
	}
}

func TestGetUsage_ReturnsCorrectBytes(t *testing.T) {
	spoolDir := t.TempDir()
	mgr, err := NewSpoolManager(spoolDir, 1024*1024, nil)
	if err != nil {
		t.Fatalf("new spool manager: %v", err)
	}

	// Initially empty.
	used, max := mgr.GetUsage()
	if used != 0 {
		t.Errorf("expected 0 bytes used initially, got %d", used)
	}
	if max != 1024*1024 {
		t.Errorf("expected max 1048576, got %d", max)
	}

	// Add a spool entry.
	err = mgr.Spool("/tmp/rec-1", "prefix-1")
	if err != nil {
		t.Fatalf("spool: %v", err)
	}

	used, _ = mgr.GetUsage()
	if used <= 0 {
		t.Error("expected positive usage after spooling an entry")
	}
}

func TestSpool_ExceedsMax_ReturnsError(t *testing.T) {
	spoolDir := t.TempDir()

	// Set a very small max size (1 byte) so it fills up after the first entry.
	mgr, err := NewSpoolManager(spoolDir, 1, nil)
	if err != nil {
		t.Fatalf("new spool manager: %v", err)
	}

	// First spool - this should succeed because the dir starts empty.
	err = mgr.Spool("/tmp/rec-1", "prefix-1")
	if err != nil {
		t.Fatalf("first spool should succeed: %v", err)
	}

	// Second spool - should fail because we're now over the max.
	err = mgr.Spool("/tmp/rec-2", "prefix-2")
	if err == nil {
		t.Fatal("expected error when spool is full")
	}
	if !strings.Contains(err.Error(), "spool full") {
		t.Errorf("error = %q, expected to contain 'spool full'", err.Error())
	}
}

func TestNewSpoolManager_CreatesDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested", "spool", "dir")

	mgr, err := NewSpoolManager(dir, 1024*1024, nil)
	if err != nil {
		t.Fatalf("new spool manager: %v", err)
	}

	// Verify the directory was created.
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatalf("stat spool dir: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected spool dir to be a directory")
	}

	_ = mgr // just to use it
}

func TestSpoolEntry_JSONRoundTrip(t *testing.T) {
	entry := SpoolEntry{
		LocalDir:   "/tmp/recordings/abc",
		R2Prefix:   "tenants/t1/recordings/abc",
		CreatedAt:  "2024-06-15T10:30:00Z",
		RetryCount: 3,
	}

	data, err := json.Marshal(entry)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var parsed SpoolEntry
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if parsed.LocalDir != entry.LocalDir {
		t.Errorf("LocalDir = %q, want %q", parsed.LocalDir, entry.LocalDir)
	}
	if parsed.R2Prefix != entry.R2Prefix {
		t.Errorf("R2Prefix = %q, want %q", parsed.R2Prefix, entry.R2Prefix)
	}
	if parsed.CreatedAt != entry.CreatedAt {
		t.Errorf("CreatedAt = %q, want %q", parsed.CreatedAt, entry.CreatedAt)
	}
	if parsed.RetryCount != entry.RetryCount {
		t.Errorf("RetryCount = %d, want %d", parsed.RetryCount, entry.RetryCount)
	}
}

func TestGetUsage_MaxBytes(t *testing.T) {
	tests := []struct {
		name     string
		maxBytes int64
	}{
		{"1MB", 1024 * 1024},
		{"100MB", 100 * 1024 * 1024},
		{"1GB", 1024 * 1024 * 1024},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spoolDir := t.TempDir()
			mgr, err := NewSpoolManager(spoolDir, tt.maxBytes, nil)
			if err != nil {
				t.Fatalf("new spool manager: %v", err)
			}

			_, max := mgr.GetUsage()
			if max != tt.maxBytes {
				t.Errorf("max = %d, want %d", max, tt.maxBytes)
			}
		})
	}
}

func TestSpool_EntryContainsTimestamp(t *testing.T) {
	spoolDir := t.TempDir()
	mgr, err := NewSpoolManager(spoolDir, 1024*1024, nil)
	if err != nil {
		t.Fatalf("new spool manager: %v", err)
	}

	err = mgr.Spool("/tmp/rec", "prefix")
	if err != nil {
		t.Fatalf("spool: %v", err)
	}

	entries, _ := os.ReadDir(spoolDir)
	if len(entries) == 0 {
		t.Fatal("no spool entries found")
	}

	data, _ := os.ReadFile(filepath.Join(spoolDir, entries[0].Name()))
	var entry SpoolEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Verify the CreatedAt is in RFC3339 format.
	if !strings.Contains(entry.CreatedAt, "T") || !strings.Contains(entry.CreatedAt, "Z") {
		t.Errorf("CreatedAt %q doesn't look like RFC3339", entry.CreatedAt)
	}
}
