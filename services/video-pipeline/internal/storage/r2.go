package storage

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// R2Storage provides S3-compatible operations for Cloudflare R2.
type R2Storage struct {
	client     *s3.Client
	presigner  *s3.PresignClient
	bucketName string
}

// R2Config holds R2 connection parameters.
type R2Config struct {
	Endpoint        string
	AccessKeyID     string
	SecretAccessKey  string
	BucketName      string
}

// NewR2Storage creates a new R2Storage client.
func NewR2Storage(ctx context.Context, cfg R2Config) (*R2Storage, error) {
	resolver := aws.EndpointResolverWithOptionsFunc(
		func(service, region string, options ...interface{}) (aws.Endpoint, error) {
			return aws.Endpoint{
				URL: cfg.Endpoint,
			}, nil
		},
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithEndpointResolverWithOptions(resolver),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKeyID, cfg.SecretAccessKey, ""),
		),
		awsconfig.WithRegion("auto"),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	return &R2Storage{
		client:     client,
		presigner:  s3.NewPresignClient(client),
		bucketName: cfg.BucketName,
	}, nil
}

// Upload uploads a single object to R2.
func (r *R2Storage) Upload(ctx context.Context, key string, reader io.Reader, contentType string) error {
	_, err := r.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(r.bucketName),
		Key:         aws.String(key),
		Body:        reader,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("put object %s: %w", key, err)
	}
	return nil
}

// Delete removes a single object from R2.
func (r *R2Storage) Delete(ctx context.Context, key string) error {
	_, err := r.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(r.bucketName),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("delete object %s: %w", key, err)
	}
	return nil
}

// GeneratePresignedURL creates a pre-signed GET URL for the given key.
func (r *R2Storage) GeneratePresignedURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	result, err := r.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(r.bucketName),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expiry))
	if err != nil {
		return "", fmt.Errorf("presign %s: %w", key, err)
	}
	return result.URL, nil
}

// ListByPrefix returns all object keys matching the given prefix.
func (r *R2Storage) ListByPrefix(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(r.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(r.bucketName),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list objects with prefix %s: %w", prefix, err)
		}
		for _, obj := range page.Contents {
			keys = append(keys, aws.ToString(obj.Key))
		}
	}
	return keys, nil
}

// DeleteByPrefix deletes all objects matching the given prefix.
func (r *R2Storage) DeleteByPrefix(ctx context.Context, prefix string) (int, error) {
	keys, err := r.ListByPrefix(ctx, prefix)
	if err != nil {
		return 0, err
	}

	deleted := 0
	for _, key := range keys {
		if err := r.Delete(ctx, key); err != nil {
			log.Printf("failed to delete %s: %v", key, err)
			continue
		}
		deleted++
	}
	return deleted, nil
}

// UploadDirectory uploads all files in a local directory to R2 under the given prefix.
func (r *R2Storage) UploadDirectory(ctx context.Context, localDir, r2Prefix string) error {
	entries, err := os.ReadDir(localDir)
	if err != nil {
		return fmt.Errorf("read dir %s: %w", localDir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		localPath := filepath.Join(localDir, entry.Name())
		r2Key := r2Prefix + "/" + entry.Name()

		f, err := os.Open(localPath)
		if err != nil {
			return fmt.Errorf("open %s: %w", localPath, err)
		}

		contentType := inferContentType(entry.Name())
		if err := r.Upload(ctx, r2Key, f, contentType); err != nil {
			f.Close()
			return fmt.Errorf("upload %s: %w", r2Key, err)
		}
		f.Close()
	}
	return nil
}

// inferContentType returns a MIME type based on file extension.
func inferContentType(filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".m3u8":
		return "application/vnd.apple.mpegurl"
	case ".ts":
		return "video/mp2t"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	default:
		return "application/octet-stream"
	}
}
