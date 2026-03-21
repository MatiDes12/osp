// Package storage provides offline event buffering using BoltDB.
// Events are queued locally when the cloud gateway is unreachable,
// then synced once connectivity is restored.
package storage

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	bolt "go.etcd.io/bbolt"
)

var (
	bucketEvents = []byte("events")
)

// DB wraps a BoltDB instance for offline event queuing.
type DB struct {
	bolt *bolt.DB
}

// QueuedEvent is an event waiting to be synced to the cloud gateway.
type QueuedEvent struct {
	ID         string                 `json:"id"`
	CameraID   string                 `json:"cameraId"`
	Type       string                 `json:"type"`
	Severity   string                 `json:"severity"`
	Metadata   map[string]interface{} `json:"metadata"`
	DetectedAt time.Time              `json:"detectedAt"`
	Synced     bool                   `json:"synced"`
	SyncedAt   *time.Time             `json:"syncedAt,omitempty"`
	RetryCount int                    `json:"retryCount"`
}

// Open opens (or creates) the BoltDB database at dataDir/edge-agent.db.
func Open(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	path := filepath.Join(dataDir, "edge-agent.db")
	db, err := bolt.Open(path, 0600, &bolt.Options{Timeout: 5 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open bolt db: %w", err)
	}

	err = db.Update(func(tx *bolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists(bucketEvents); err != nil {
			return fmt.Errorf("create events bucket: %w", err)
		}
		return nil
	})
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("init buckets: %w", err)
	}

	slog.Info("storage opened", "path", path)
	return &DB{bolt: db}, nil
}

// Close closes the database.
func (db *DB) Close() error {
	return db.bolt.Close()
}

// EnqueueEvent adds an event to the pending sync queue.
func (db *DB) EnqueueEvent(evt QueuedEvent) error {
	return db.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEvents)
		data, err := json.Marshal(evt)
		if err != nil {
			return fmt.Errorf("marshal event: %w", err)
		}
		return b.Put([]byte(evt.ID), data)
	})
}

// GetPendingEvents returns up to limit unsynced events (oldest first).
func (db *DB) GetPendingEvents(limit int) ([]QueuedEvent, error) {
	var events []QueuedEvent
	err := db.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEvents)
		c := b.Cursor()
		for k, v := c.First(); k != nil && len(events) < limit; k, v = c.Next() {
			var evt QueuedEvent
			if err := json.Unmarshal(v, &evt); err != nil {
				continue
			}
			if !evt.Synced {
				events = append(events, evt)
			}
		}
		return nil
	})
	return events, err
}

// MarkEventSynced marks an event as successfully synced.
func (db *DB) MarkEventSynced(id string) error {
	return db.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEvents)
		data := b.Get([]byte(id))
		if data == nil {
			return nil
		}
		var evt QueuedEvent
		if err := json.Unmarshal(data, &evt); err != nil {
			return err
		}
		now := time.Now()
		evt.Synced = true
		evt.SyncedAt = &now
		updated, err := json.Marshal(evt)
		if err != nil {
			return err
		}
		return b.Put([]byte(id), updated)
	})
}

// IncrementRetry increments the retry counter for a failed sync attempt.
func (db *DB) IncrementRetry(id string) error {
	return db.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEvents)
		data := b.Get([]byte(id))
		if data == nil {
			return nil
		}
		var evt QueuedEvent
		if err := json.Unmarshal(data, &evt); err != nil {
			return err
		}
		evt.RetryCount++
		updated, err := json.Marshal(evt)
		if err != nil {
			return err
		}
		return b.Put([]byte(id), updated)
	})
}

// PruneOldSynced deletes synced events older than the given duration.
// Returns the number of events pruned.
func (db *DB) PruneOldSynced(olderThan time.Duration) (int, error) {
	cutoff := time.Now().Add(-olderThan)
	var pruned int
	err := db.bolt.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEvents)
		c := b.Cursor()
		var toDelete [][]byte
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var evt QueuedEvent
			if err := json.Unmarshal(v, &evt); err != nil {
				continue
			}
			if evt.Synced && evt.SyncedAt != nil && evt.SyncedAt.Before(cutoff) {
				toDelete = append(toDelete, append([]byte{}, k...))
			}
		}
		for _, k := range toDelete {
			if err := b.Delete(k); err != nil {
				return err
			}
			pruned++
		}
		return nil
	})
	return pruned, err
}

// Stats returns counts of pending and synced events.
func (db *DB) Stats() (pending, synced int, err error) {
	err = db.bolt.View(func(tx *bolt.Tx) error {
		b := tx.Bucket(bucketEvents)
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			var evt QueuedEvent
			if jsonErr := json.Unmarshal(v, &evt); jsonErr != nil {
				continue
			}
			if evt.Synced {
				synced++
			} else {
				pending++
			}
		}
		return nil
	})
	return
}
