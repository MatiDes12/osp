import { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { getAccessToken } from "../../lib/auth";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function RecordScreen() {
  const { id: cameraId } = useLocalSearchParams<{ id: string }>();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check if already recording
    checkStatus();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function checkStatus() {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.data?.isRecording) {
        setIsRecording(true);
        setRecordingId(json.data.recording?.id ?? null);
        startTimer();
      }
    } catch {
      // ignore
    }
  }

  function startTimer() {
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setDuration(0);
  }

  function formatDuration(secs: number) {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  async function handleToggleRecording() {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!isRecording) {
        const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/start`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "manual" }),
        });
        const json = await res.json();
        if (json.success) {
          setIsRecording(true);
          setRecordingId(json.data.recordingId);
          startTimer();
        } else {
          Alert.alert("Error", json.error?.message ?? "Failed to start recording");
        }
      } else {
        const res = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/record/stop`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        const json = await res.json();
        if (json.success) {
          setIsRecording(false);
          setRecordingId(null);
          stopTimer();
          Alert.alert("Recording saved", "Your recording has been saved.");
        } else {
          Alert.alert("Error", json.error?.message ?? "Failed to stop recording");
        }
      }
    } catch (err) {
      Alert.alert("Error", "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.indicator}>
        {isRecording ? (
          <>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC {formatDuration(duration)}</Text>
          </>
        ) : (
          <Text style={styles.idleText}>Ready to record</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, isRecording ? styles.stopButton : styles.startButton]}
        onPress={handleToggleRecording}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "..." : isRecording ? "⏹ Stop Recording" : "⏺ Start Recording"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backText}>← Back to Camera</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#09090b",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: 24,
  },
  indicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ef4444",
  },
  recText: {
    color: "#ef4444",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  idleText: {
    color: "#71717a",
    fontSize: 18,
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  startButton: { backgroundColor: "#ef4444" },
  stopButton: { backgroundColor: "#27272a", borderWidth: 2, borderColor: "#ef4444" },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  backButton: { marginTop: 8 },
  backText: { color: "#3b82f6", fontSize: 14 },
});
