package snapshot

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
)

// Extractor captures JPEG frames from RTSP streams or recording files using FFmpeg.
type Extractor struct {
	ffmpegPath string
}

// NewExtractor creates a new snapshot Extractor.
func NewExtractor(ffmpegPath string) *Extractor {
	return &Extractor{ffmpegPath: ffmpegPath}
}

// ExtractFrame grabs a single JPEG frame from a live RTSP stream.
func (e *Extractor) ExtractFrame(ctx context.Context, rtspURL string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, e.ffmpegPath,
		"-i", rtspURL,
		"-vframes", "1",
		"-f", "image2",
		"pipe:1",
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("extract frame from %s: %w (stderr: %s)", rtspURL, err, stderr.String())
	}

	data := stdout.Bytes()
	if len(data) == 0 {
		return nil, fmt.Errorf("extract frame from %s: empty output", rtspURL)
	}

	return data, nil
}

// ExtractFromRecording grabs a JPEG frame at a specific timestamp from a recording file.
func (e *Extractor) ExtractFromRecording(ctx context.Context, recordingPath string, timestampSec float64) ([]byte, error) {
	cmd := exec.CommandContext(ctx, e.ffmpegPath,
		"-ss", fmt.Sprintf("%.2f", timestampSec),
		"-i", recordingPath,
		"-vframes", "1",
		"-f", "image2",
		"pipe:1",
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("extract frame at %.2fs from %s: %w (stderr: %s)",
			timestampSec, recordingPath, err, stderr.String())
	}

	data := stdout.Bytes()
	if len(data) == 0 {
		return nil, fmt.Errorf("extract frame at %.2fs from %s: empty output", timestampSec, recordingPath)
	}

	return data, nil
}
