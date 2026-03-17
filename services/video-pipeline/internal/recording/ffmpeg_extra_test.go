package recording

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildArgs_OutputDirectoryStructure(t *testing.T) {
	tests := []struct {
		name      string
		outputDir string
	}{
		{"simple path", "/tmp/recordings/abc123"},
		{"nested path", "/data/tenants/t1/cameras/c1/2024/01/15/rec-001"},
		{"path with hyphens", "/var/osp-data/rec-abc-def"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := DefaultFFmpegConfig("ffmpeg")
			args := BuildArgs("rtsp://cam/stream", tt.outputDir, cfg)

			// The last argument should be the playlist path under the output dir.
			playlistPath := args[len(args)-1]
			expectedPlaylist := filepath.Join(tt.outputDir, "playlist.m3u8")
			if playlistPath != expectedPlaylist {
				t.Errorf("playlist path = %q, want %q", playlistPath, expectedPlaylist)
			}

			// Find segment filename and verify it's also under the output dir.
			for i, a := range args {
				if a == "-hls_segment_filename" && i+1 < len(args) {
					segPattern := args[i+1]
					expectedSeg := filepath.Join(tt.outputDir, "seg_%04d.ts")
					if segPattern != expectedSeg {
						t.Errorf("segment pattern = %q, want %q", segPattern, expectedSeg)
					}
				}
			}
		})
	}
}

func TestBuildArgs_SegmentFilenamePattern_Format(t *testing.T) {
	cfg := DefaultFFmpegConfig("ffmpeg")
	args := BuildArgs("rtsp://cam/stream", "/output", cfg)

	foundPattern := false
	for i, a := range args {
		if a == "-hls_segment_filename" && i+1 < len(args) {
			pattern := args[i+1]
			// Verify the pattern uses zero-padded 4-digit numbering.
			if !strings.Contains(pattern, "seg_%04d.ts") {
				t.Errorf("segment pattern %q does not use seg_%%04d.ts format", pattern)
			}
			// Verify .ts extension.
			if !strings.HasSuffix(pattern, ".ts") {
				t.Errorf("segment pattern %q does not end with .ts", pattern)
			}
			foundPattern = true
		}
	}
	if !foundPattern {
		t.Error("expected -hls_segment_filename flag in args")
	}
}

func TestBuildArgs_DurationLimit_NotIncludedByDefault(t *testing.T) {
	// The default BuildArgs does not include a duration limit (-t flag).
	cfg := DefaultFFmpegConfig("ffmpeg")
	args := BuildArgs("rtsp://cam/stream", "/output", cfg)

	for _, a := range args {
		if a == "-t" {
			t.Error("default args should not include -t (duration limit)")
		}
	}
}

func TestBuildArgs_VideoCodecOverride(t *testing.T) {
	tests := []struct {
		name       string
		videoCodec string
		audioCodec string
	}{
		{"h264 encoding", "libx264", "aac"},
		{"h265 encoding", "libx265", "aac"},
		{"copy both", "copy", "copy"},
		{"vp9 with opus", "libvpx-vp9", "libopus"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := FFmpegConfig{
				FFmpegPath:      "ffmpeg",
				SegmentDuration: 2,
				VideoCodec:      tt.videoCodec,
				AudioCodec:      tt.audioCodec,
			}

			args := BuildArgs("rtsp://cam/stream", "/output", cfg)

			foundVC := false
			foundAC := false
			for i, a := range args {
				if a == "-c:v" && i+1 < len(args) {
					if args[i+1] != tt.videoCodec {
						t.Errorf("video codec = %q, want %q", args[i+1], tt.videoCodec)
					}
					foundVC = true
				}
				if a == "-c:a" && i+1 < len(args) {
					if args[i+1] != tt.audioCodec {
						t.Errorf("audio codec = %q, want %q", args[i+1], tt.audioCodec)
					}
					foundAC = true
				}
			}
			if !foundVC {
				t.Error("expected -c:v flag")
			}
			if !foundAC {
				t.Error("expected -c:a flag")
			}
		})
	}
}

func TestBuildArgs_HLSFormat(t *testing.T) {
	cfg := DefaultFFmpegConfig("ffmpeg")
	args := BuildArgs("rtsp://cam/stream", "/output", cfg)

	foundFormat := false
	for i, a := range args {
		if a == "-f" && i+1 < len(args) {
			if args[i+1] != "hls" {
				t.Errorf("format = %q, want hls", args[i+1])
			}
			foundFormat = true
		}
	}
	if !foundFormat {
		t.Error("expected -f hls in args")
	}
}

func TestBuildArgs_HLSListSizeZero(t *testing.T) {
	cfg := DefaultFFmpegConfig("ffmpeg")
	args := BuildArgs("rtsp://cam/stream", "/output", cfg)

	foundListSize := false
	for i, a := range args {
		if a == "-hls_list_size" && i+1 < len(args) {
			if args[i+1] != "0" {
				t.Errorf("hls_list_size = %q, want 0", args[i+1])
			}
			foundListSize = true
		}
	}
	if !foundListSize {
		t.Error("expected -hls_list_size 0 in args")
	}
}

func TestBuildArgs_InputURL(t *testing.T) {
	tests := []struct {
		name     string
		inputURL string
	}{
		{"standard RTSP", "rtsp://10.0.0.1:554/stream"},
		{"RTSP with auth", "rtsp://admin:pass@10.0.0.1:554/cam/realmonitor"},
		{"RTSP with query params", "rtsp://cam:554/stream?channel=1&subtype=0"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := DefaultFFmpegConfig("ffmpeg")
			args := BuildArgs(tt.inputURL, "/output", cfg)

			if len(args) < 2 {
				t.Fatal("args too short")
			}
			if args[0] != "-i" {
				t.Errorf("first arg = %q, want -i", args[0])
			}
			if args[1] != tt.inputURL {
				t.Errorf("input URL = %q, want %q", args[1], tt.inputURL)
			}
		})
	}
}

func TestBuildArgs_SegmentDurationVariations(t *testing.T) {
	tests := []struct {
		name     string
		duration int
		want     string
	}{
		{"1 second", 1, "1"},
		{"2 seconds (default)", 2, "2"},
		{"4 seconds", 4, "4"},
		{"10 seconds", 10, "10"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := FFmpegConfig{
				FFmpegPath:      "ffmpeg",
				SegmentDuration: tt.duration,
				VideoCodec:      "copy",
				AudioCodec:      "aac",
			}
			args := BuildArgs("rtsp://cam/stream", "/output", cfg)

			foundDuration := false
			for i, a := range args {
				if a == "-hls_time" && i+1 < len(args) {
					if args[i+1] != tt.want {
						t.Errorf("hls_time = %q, want %q", args[i+1], tt.want)
					}
					foundDuration = true
				}
			}
			if !foundDuration {
				t.Error("expected -hls_time in args")
			}
		})
	}
}

func TestFFmpegProcess_OutputDir(t *testing.T) {
	proc := &FFmpegProcess{
		outputDir: "/data/recordings/test",
		done:      make(chan struct{}),
	}

	if proc.OutputDir() != "/data/recordings/test" {
		t.Errorf("OutputDir() = %q, want /data/recordings/test", proc.OutputDir())
	}
}

func TestFFmpegProcess_ExitErr_Nil(t *testing.T) {
	proc := &FFmpegProcess{
		done: make(chan struct{}),
	}

	if proc.ExitErr() != nil {
		t.Errorf("ExitErr() = %v, want nil", proc.ExitErr())
	}
}
