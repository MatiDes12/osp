import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Camera, CameraStatus } from "@osp/shared/types";
import { colors, spacing, borderRadius, fontSize } from "@/constants/theme";

interface CameraCardProps {
  readonly camera: Camera;
  readonly onPress: (camera: Camera) => void;
}

const STATUS_COLORS: Record<CameraStatus, string> = {
  online: colors.success,
  offline: colors.textMuted,
  connecting: colors.warning,
  error: colors.error,
  disabled: colors.textMuted,
};

const STATUS_LABELS: Record<CameraStatus, string> = {
  online: "Online",
  offline: "Offline",
  connecting: "Connecting",
  error: "Error",
  disabled: "Disabled",
};

function formatLastSeen(lastSeenAt: string | null): string {
  if (!lastSeenAt) {
    return "Never";
  }
  const date = new Date(lastSeenAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function CameraCard({ camera, onPress }: CameraCardProps) {
  const statusColor = STATUS_COLORS[camera.status];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(camera)}
      activeOpacity={0.7}
    >
      <View style={styles.thumbnail}>
        <Text style={styles.thumbnailText}>{camera.name.charAt(0).toUpperCase()}</Text>
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {camera.name}
          </Text>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABELS[camera.status]}
          </Text>
        </View>

        <Text style={styles.lastSeen}>
          {formatLastSeen(camera.lastSeenAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    margin: spacing.xs,
  },
  thumbnail: {
    height: 100,
    backgroundColor: "#111114",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailText: {
    color: colors.textMuted,
    fontSize: fontSize.xxl,
    fontWeight: "600",
  },
  info: {
    padding: spacing.md,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
    flex: 1,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  lastSeen: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
});
