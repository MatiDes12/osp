package recording

import (
	"testing"
)

func TestBuildArgs_HLSOutput(t *testing.T) {
	cfg := FFmpegConfig{
		FFmpegPath:      "ffmpeg",
		SegmentDuration: 2,
		VideoCodec:      "copy",
		AudioCodec:      "aac",
	}

	args := BuildArgs("rtsp://localhost:8554/camera1", "/tmp/rec123", cfg)

	expected := []string{
		"-i", "rtsp://localhost:8554/camera1",
		"-c:v", "copy",
		"-c:a", "aac",
		"-f", "hls",
		"-hls_time", "2",
		"-hls_list_size", "0",
		"-hls_segment_filename", "/tmp/rec123/seg_%04d.ts",
		"/tmp/rec123/playlist.m3u8",
	}

	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d: %v", len(expected), len(args), args)
	}

	for i, want := range expected {
		if args[i] != want {
			t.Errorf("arg[%d]: expected %q, got %q", i, want, args[i])
		}
	}
}

func TestBuildArgs_CustomCodecs(t *testing.T) {
	cfg := FFmpegConfig{
		FFmpegPath:      "ffmpeg",
		SegmentDuration: 4,
		VideoCodec:      "libx264",
		AudioCodec:      "libopus",
	}

	args := BuildArgs("rtsp://10.0.0.5:554/stream", "/data/output", cfg)

	// Verify video codec
	foundVC := false
	for i, a := range args {
		if a == "-c:v" && i+1 < len(args) && args[i+1] == "libx264" {
			foundVC = true
		}
	}
	if !foundVC {
		t.Error("expected video codec libx264 in args")
	}

	// Verify audio codec
	foundAC := false
	for i, a := range args {
		if a == "-c:a" && i+1 < len(args) && args[i+1] == "libopus" {
			foundAC = true
		}
	}
	if !foundAC {
		t.Error("expected audio codec libopus in args")
	}

	// Verify segment duration
	foundSD := false
	for i, a := range args {
		if a == "-hls_time" && i+1 < len(args) && args[i+1] == "4" {
			foundSD = true
		}
	}
	if !foundSD {
		t.Error("expected hls_time 4 in args")
	}
}

func TestBuildArgs_SegmentFilenamePattern(t *testing.T) {
	cfg := DefaultFFmpegConfig("ffmpeg")
	args := BuildArgs("rtsp://cam/stream", "/var/recordings/abc", cfg)

	foundSegFilename := false
	for i, a := range args {
		if a == "-hls_segment_filename" && i+1 < len(args) {
			expected := "/var/recordings/abc/seg_%04d.ts"
			if args[i+1] != expected {
				t.Errorf("segment filename: expected %q, got %q", expected, args[i+1])
			}
			foundSegFilename = true
		}
	}
	if !foundSegFilename {
		t.Error("expected -hls_segment_filename flag in args")
	}
}

func TestDefaultFFmpegConfig(t *testing.T) {
	cfg := DefaultFFmpegConfig("/usr/bin/ffmpeg")

	if cfg.FFmpegPath != "/usr/bin/ffmpeg" {
		t.Errorf("FFmpegPath: expected /usr/bin/ffmpeg, got %s", cfg.FFmpegPath)
	}
	if cfg.SegmentDuration != 2 {
		t.Errorf("SegmentDuration: expected 2, got %d", cfg.SegmentDuration)
	}
	if cfg.VideoCodec != "copy" {
		t.Errorf("VideoCodec: expected copy, got %s", cfg.VideoCodec)
	}
	if cfg.AudioCodec != "aac" {
		t.Errorf("AudioCodec: expected aac, got %s", cfg.AudioCodec)
	}
}

func TestStop_AlreadyStopped(t *testing.T) {
	// Verify that calling Stop on an already-stopped process does not panic.
	proc := &FFmpegProcess{
		done:    make(chan struct{}),
		stopped: true,
	}
	close(proc.done)

	err := proc.Stop()
	if err != nil {
		// exitErr is nil for a zero-value process, so this should be nil.
		t.Errorf("expected nil error for already-stopped process, got: %v", err)
	}
}
