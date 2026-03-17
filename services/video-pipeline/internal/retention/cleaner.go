package retention

import (
	"context"
	"log"
	"time"

	"github.com/MatiDes12/osp/services/video-pipeline/internal/db"
	"github.com/MatiDes12/osp/services/video-pipeline/internal/storage"
)

const (
	cleanupInterval = 1 * time.Hour
	cleanupBatch    = 100
)

// Cleaner periodically removes recordings that have exceeded their retention period.
type Cleaner struct {
	db *db.Queries
	r2 *storage.R2Storage
}

// NewCleaner creates a new retention Cleaner.
func NewCleaner(queries *db.Queries, r2 *storage.R2Storage) *Cleaner {
	return &Cleaner{
		db: queries,
		r2: r2,
	}
}

// Run starts the retention cleaner loop. It blocks until the context is cancelled.
func (c *Cleaner) Run(ctx context.Context) {
	log.Println("retention cleaner started")
	defer log.Println("retention cleaner stopped")

	// Run once immediately on startup.
	c.cleanOnce(ctx)

	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.cleanOnce(ctx)
		}
	}
}

func (c *Cleaner) cleanOnce(ctx context.Context) {
	expired, err := c.db.FindExpiredRecordings(ctx, cleanupBatch)
	if err != nil {
		log.Printf("retention cleaner: find expired: %v", err)
		return
	}

	if len(expired) == 0 {
		return
	}

	log.Printf("retention cleaner: found %d expired recordings", len(expired))

	deleted := 0
	for _, rec := range expired {
		if ctx.Err() != nil {
			return
		}

		// Delete all objects under the recording's storage path.
		count, err := c.r2.DeleteByPrefix(ctx, rec.StoragePath)
		if err != nil {
			log.Printf("retention cleaner: delete R2 prefix %s: %v", rec.StoragePath, err)
			continue
		}

		// Mark as deleted in DB.
		if err := c.db.UpdateRecordingStatus(ctx, rec.ID, "deleted"); err != nil {
			log.Printf("retention cleaner: update status for %s: %v", rec.ID, err)
			continue
		}

		deleted++
		log.Printf("retention cleaner: deleted recording %s (%d objects from R2)", rec.ID, count)
	}

	log.Printf("retention cleaner: cleaned %d/%d expired recordings", deleted, len(expired))
}
