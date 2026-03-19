import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { Camera, OSPEvent } from "@osp/shared/types";
import { api } from "@/lib/api";
import { transformCamera, transformEvents } from "@/lib/transforms";
import { EventRow } from "@/components/EventRow";
import { colors, spacing, borderRadius, fontSize } from "@/constants/theme";
import { MobileLiveViewWebRTCPlayer } from "@/components/camera/MobileLiveViewWebRTCPlayer";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const STATUS_COLORS: Record<string, string> = {
  online: colors.success,
  offline: colors.textMuted,
  connecting: colors.warning,
  error: colors.error,
  disabled: colors.textMuted,
};

export default function CameraDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [camera, setCamera] = useState<Camera | null>(null);
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (showRefresh = false) => {
      if (!id) return;

      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const [cameraResult, eventsResult] = await Promise.all([
          api.get<Camera>(`/api/v1/cameras/${id}`),
          api.get<OSPEvent[]>(`/api/v1/events`, {
            cameraId: id,
            limit: 10,
          }),
        ]);

        if (cameraResult.success && cameraResult.data) {
          setCamera(transformCamera(cameraResult.data));
          setError(null);
        } else {
          setError(cameraResult.error?.message ?? "Camera not found.");
        }

        if (eventsResult.success && eventsResult.data) {
          setEvents(transformEvents(eventsResult.data));
        }
      } catch {
        setError("Unable to connect to server.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePtz = useCallback(
    async (direction: string) => {
      if (!id) return;
      try {
        await api.post(`/api/v1/cameras/${id}/ptz`, { action: direction });
      } catch {
        // PTZ command failed silently
      }
    },
    [id],
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error || !camera) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? "Camera not found."}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchData()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[camera.status] ?? colors.textMuted;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => fetchData(true)}
          tintColor={colors.primary}
        />
      }
    >
      {/* Live View */}
      <View style={styles.liveView}>
        {camera.status === "online" ? (
          <MobileLiveViewWebRTCPlayer cameraId={camera.id} status={camera.status} />
        ) : (
          <View style={styles.liveViewOffline}>
            <Text style={styles.liveViewLabel}>{camera.name}</Text>
            <View style={styles.liveViewStatus}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {camera.status.toUpperCase()}
              </Text>
            </View>
          </View>
        )}
        {camera.status === "online" && (
          <View style={styles.liveOverlay}>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <Text style={styles.liveNameText}>{camera.name}</Text>
          </View>
        )}
      </View>

      {/* Camera Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Camera Info</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Status" value={camera.status.toUpperCase()} />
          <InfoRow label="Protocol" value={camera.protocol.toUpperCase()} />
          {camera.manufacturer && (
            <InfoRow label="Manufacturer" value={camera.manufacturer} />
          )}
          {camera.model && <InfoRow label="Model" value={camera.model} />}
          {camera.firmwareVersion && (
            <InfoRow label="Firmware" value={camera.firmwareVersion} />
          )}
          <InfoRow
            label="Resolution"
            value={camera.capabilities.resolution}
          />
          <InfoRow
            label="Recording"
            value={camera.config.recordingMode.toUpperCase()}
          />
          {camera.location.label && (
            <InfoRow label="Location" value={camera.location.label} />
          )}
          <InfoRow label="Zones" value={String(camera.zonesCount)} />
        </View>
      </View>

      {/* PTZ Controls */}
      {camera.ptzCapable && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PTZ Controls</Text>
          <View style={styles.ptzContainer}>
            <View style={styles.ptzRow}>
              <View style={styles.ptzSpacer} />
              <PtzButton label="Up" onPress={() => handlePtz("up")} />
              <View style={styles.ptzSpacer} />
            </View>
            <View style={styles.ptzRow}>
              <PtzButton label="Left" onPress={() => handlePtz("left")} />
              <PtzButton label="Home" onPress={() => handlePtz("home")} />
              <PtzButton label="Right" onPress={() => handlePtz("right")} />
            </View>
            <View style={styles.ptzRow}>
              <View style={styles.ptzSpacer} />
              <PtzButton label="Down" onPress={() => handlePtz("down")} />
              <View style={styles.ptzSpacer} />
            </View>
            <View style={styles.zoomRow}>
              <PtzButton label="Zoom +" onPress={() => handlePtz("zoom_in")} />
              <PtzButton label="Zoom -" onPress={() => handlePtz("zoom_out")} />
            </View>
          </View>
        </View>
      )}

      {/* Recent Events */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Events</Text>
        {events.length === 0 ? (
          <View style={styles.emptyEvents}>
            <Text style={styles.emptyEventsText}>
              No recent events for this camera.
            </Text>
          </View>
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onPress={() => {
                // Event detail navigation
              }}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function PtzButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.ptzButton} activeOpacity={0.6} onPress={onPress}>
      <Text style={styles.ptzButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxxl,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  liveView: {
    height: 240,
    backgroundColor: "#000",
    position: "relative",
  },
  liveImage: {
    width: "100%",
    height: "100%",
  },
  liveViewOffline: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  liveViewLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  liveViewStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  liveOverlay: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(220, 38, 38, 0.85)",
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginRight: spacing.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
    marginRight: 4,
  },
  liveText: {
    color: "#fff",
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  liveNameText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  section: {
    marginTop: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  infoValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "500",
  },
  ptzContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  ptzRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.xs,
  },
  ptzSpacer: {
    width: 64,
    height: 40,
    margin: spacing.xs,
  },
  ptzButton: {
    width: 64,
    height: 40,
    backgroundColor: colors.surfaceElevated,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    margin: spacing.xs,
  },
  ptzButtonText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  zoomRow: {
    flexDirection: "row",
    marginTop: spacing.md,
  },
  emptyEvents: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  emptyEventsText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
});
