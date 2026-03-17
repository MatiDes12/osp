package recording

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// FFmpegProcess wraps an os/exec.Cmd for an FFmpeg recording session.
type FFmpegProcess struct {
	cmd       *exec.Cmd
	outputDir string
	stderr    io.ReadCloser
	done      chan struct{}
	mu        sync.Mutex
	exitErr   error
	stopped   bool
}

// FFmpegConfig controls how FFmpeg is invoked.
type FFmpegConfig struct {
	FFmpegPath      string
	SegmentDuration int // seconds per HLS segment
	VideoCodec      string
	AudioCodec      string
}

// DefaultFFmpegConfig returns sensible defaults for HLS recording.
func DefaultFFmpegConfig(ffmpegPath string) FFmpegConfig {
	return FFmpegConfig{
		FFmpegPath:      ffmpegPath,
		SegmentDuration: 2,
		VideoCodec:      "copy",
		AudioCodec:      "aac",
	}
}

// BuildArgs constructs the ffmpeg argument list for HLS recording.
// This is exported to allow unit testing without running ffmpeg.
func BuildArgs(inputURL, outputDir string, cfg FFmpegConfig) []string {
	segPattern := filepath.Join(outputDir, "seg_%04d.ts")
	playlistPath := filepath.Join(outputDir, "playlist.m3u8")

	return []string{
		"-i", inputURL,
		"-c:v", cfg.VideoCodec,
		"-c:a", cfg.AudioCodec,
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%d", cfg.SegmentDuration),
		"-hls_list_size", "0",
		"-hls_segment_filename", segPattern,
		playlistPath,
	}
}

// StartFFmpeg launches an FFmpeg process for HLS recording from an RTSP source.
func StartFFmpeg(ctx context.Context, inputURL, outputDir string, cfg FFmpegConfig) (*FFmpegProcess, error) {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return nil, fmt.Errorf("create output dir: %w", err)
	}

	args := BuildArgs(inputURL, outputDir, cfg)
	cmd := exec.CommandContext(ctx, cfg.FFmpegPath, args...)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start ffmpeg: %w", err)
	}

	proc := &FFmpegProcess{
		cmd:       cmd,
		outputDir: outputDir,
		stderr:    stderr,
		done:      make(chan struct{}),
	}

	go proc.monitor()

	return proc, nil
}

// Stop gracefully stops the FFmpeg process. It sends SIGINT first, waits up to
// 5 seconds, then sends SIGKILL if the process has not exited.
func (p *FFmpegProcess) Stop() error {
	p.mu.Lock()
	if p.stopped {
		p.mu.Unlock()
		<-p.done
		return p.exitErr
	}
	p.stopped = true
	p.mu.Unlock()

	if p.cmd.Process == nil {
		return nil
	}

	// Send SIGINT for graceful HLS finalization.
	if err := p.cmd.Process.Signal(syscall.SIGINT); err != nil {
		log.Printf("ffmpeg SIGINT failed: %v, sending SIGKILL", err)
		_ = p.cmd.Process.Kill()
		<-p.done
		return p.exitErr
	}

	// Wait with timeout.
	select {
	case <-p.done:
		return p.exitErr
	case <-time.After(5 * time.Second):
		log.Printf("ffmpeg did not exit after SIGINT, sending SIGKILL")
		_ = p.cmd.Process.Kill()
		<-p.done
		return p.exitErr
	}
}

// Done returns a channel that is closed when the FFmpeg process exits.
func (p *FFmpegProcess) Done() <-chan struct{} {
	return p.done
}

// ExitErr returns the error from the FFmpeg process after it has exited.
func (p *FFmpegProcess) ExitErr() error {
	return p.exitErr
}

// OutputDir returns the directory where HLS segments are written.
func (p *FFmpegProcess) OutputDir() string {
	return p.outputDir
}

// monitor watches the FFmpeg process, logs stderr output, and signals completion.
func (p *FFmpegProcess) monitor() {
	defer close(p.done)

	// Drain stderr in the background for logging.
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := p.stderr.Read(buf)
			if n > 0 {
				log.Printf("ffmpeg stderr: %s", string(buf[:n]))
			}
			if err != nil {
				return
			}
		}
	}()

	p.exitErr = p.cmd.Wait()
	if p.exitErr != nil {
		log.Printf("ffmpeg exited with error: %v", p.exitErr)
	}
}
