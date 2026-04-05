import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { OSPEvent, EventSeverity, EventType } from "@osp/shared/types";
import { colors, spacing, borderRadius, fontSize } from "@/constants/theme";

interface EventRowProps {
  readonly event: OSPEvent;
  readonly onPress: (event: OSPEvent) => void;
}

const SEVERITY_COLORS: Record<EventSeverity, string> = {
  low: colors.info,
  medium: colors.warning,
  high: colors.error,
  critical: colors.critical,
};

const TYPE_LABELS: Record<EventType, string> = {
  motion: "Motion",
  person: "Person",
  vehicle: "Vehicle",
  animal: "Animal",
  camera_offline: "Offline",
  camera_online: "Online",
  tampering: "Tamper",
  audio: "Audio",
  "lpr.detected": "LPR",
  "lpr.alert": "LPR Alert",
  custom: "Custom",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return time;

  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

export function EventRow({ event, onPress }: EventRowProps) {
  const severityColor = SEVERITY_COLORS[event.severity];

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(event)}
      activeOpacity={0.7}
    >
      <View style={[styles.severityBar, { backgroundColor: severityColor }]} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.timestamp}>
            {formatTimestamp(event.detectedAt)}
          </Text>
          <View style={[styles.typeBadge, { borderColor: severityColor }]}>
            <Text style={[styles.typeText, { color: severityColor }]}>
              {TYPE_LABELS[event.type]}
            </Text>
          </View>
        </View>

        <Text style={styles.cameraName} numberOfLines={1}>
          {event.cameraName}
        </Text>

        {event.zoneName && (
          <Text style={styles.zone} numberOfLines={1}>
            Zone: {event.zoneName}
          </Text>
        )}
      </View>

      {!event.acknowledged && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    overflow: "hidden",
  },
  severityBar: {
    width: 4,
    alignSelf: "stretch",
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  timestamp: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
  typeBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  typeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  cameraName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "500",
  },
  zone: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    marginRight: spacing.md,
  },
});
