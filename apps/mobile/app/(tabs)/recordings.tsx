import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  SectionList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import type { Recording, RecordingTrigger } from "@osp/shared/types";
import { api } from "@/lib/api";
import {
  saveRecordingsCache,
  loadRecordingsCache,
  formatCacheAge,
} from "@/lib/recordings-cache";
import { colors, spacing, borderRadius, fontSize } from "@/constants/theme";

interface RecordingSection {
  readonly title: string;
  readonly data: readonly Recording[];
}

const TRIGGER_COLORS: Record<RecordingTrigger, string> = {
  motion: colors.warning,
  continuous: colors.info,
  manual: colors.textSecondary,
  rule: colors.primary,
  ai_detection: colors.success,
};

const TRIGGER_LABELS: Record<RecordingTrigger, string> = {
  motion: "Motion",
  continuous: "Continuous",
  manual: "Manual",
  rule: "Rule",
  ai_detection: "AI",
};

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDate(recordings: readonly Recording[]): readonly RecordingSection[] {
  const groups: Record<string, Recording[]> = {};

  for (const recording of recordings) {
    const date = new Date(recording.startTime);
    const key = date.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(recording);
  }

  return Object.entries(groups).map(([title, data]) => ({
    title,
    data,
  }));
}

export default function RecordingsScreen() {
  const [recordings, setRecordings] = useState<readonly Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const fetchRecordings = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);

    try {
      const result = await api.get<Recording[]>("/api/v1/recordings", {
        limit: 50,
        sortBy: "startTime",
        sortOrder: "desc",
      });

      if (result.success && result.data) {
        setRecordings(result.data);
        setIsOffline(false);
        setCachedAt(null);
        // Persist the latest 20 items for offline use
        void saveRecordingsCache(result.data);
      } else {
        // API error but we got a response — don't fall back to cache
        if (!showRefresh) setIsLoading(false);
        setIsRefreshing(false);
      }
    } catch {
      // Network failure — load from cache
      const { recordings: cached, cachedAt: ts } = await loadRecordingsCache();
      if (cached.length > 0) {
        setRecordings(cached);
        setIsOffline(true);
        setCachedAt(ts);
      } else {
        setIsOffline(true);
        setCachedAt(null);
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // On mount: load cache immediately so the list renders without a spinner,
  // then fetch fresh data in the background.
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { recordings: cached, cachedAt: ts } = await loadRecordingsCache();
      if (!cancelled && cached.length > 0) {
        setRecordings(cached);
        setIsOffline(false); // optimistic — mark offline only if API fails
        setCachedAt(ts);
        setIsLoading(false);
      }
      // Always attempt a live fetch
      await fetchRecordings();
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [fetchRecordings]);

  const handleRecordingPress = useCallback((recording: Recording) => {
    Alert.alert(
      "Playback",
      `Video playback for "${recording.cameraName}" is not yet available in this build.`,
    );
  }, []);

  const handleRefresh = useCallback(() => {
    fetchRecordings(true);
  }, [fetchRecordings]);

  const sections = groupByDate(recordings);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineDot}>●</Text>
          <Text style={styles.offlineText}>
            Offline{cachedAt ? ` — cached ${formatCacheAge(cachedAt)}` : " — no cached data"}
          </Text>
        </View>
      )}

      <SectionList
        sections={sections as RecordingSection[]}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => handleRecordingPress(item)}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.cameraName} numberOfLines={1}>
                {item.cameraName}
              </Text>
              <Text style={styles.timeRange}>
                {formatTime(item.startTime)} - {formatTime(item.endTime)}
              </Text>
            </View>

            <View style={styles.rowRight}>
              <View
                style={[
                  styles.triggerBadge,
                  { borderColor: TRIGGER_COLORS[item.trigger] },
                ]}
              >
                <Text
                  style={[
                    styles.triggerText,
                    { color: TRIGGER_COLORS[item.trigger] },
                  ]}
                >
                  {TRIGGER_LABELS[item.trigger]}
                </Text>
              </View>
              <Text style={styles.duration}>
                {formatDuration(item.durationSec)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {isOffline ? "No Cached Recordings" : "No Recordings"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {isOffline
                ? "Connect to the internet to load your recordings."
                : "Recordings will appear here when your cameras capture footage."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#78350f",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  offlineDot: {
    color: colors.warning,
    fontSize: 8,
    marginRight: spacing.sm,
  },
  offlineText: {
    color: "#fef3c7",
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    padding: spacing.md,
  },
  rowLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  cameraName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "500",
    marginBottom: 2,
  },
  timeRange: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  rowRight: {
    alignItems: "flex-end",
  },
  triggerBadge: {
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginBottom: spacing.xs,
  },
  triggerText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  duration: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: "center",
    paddingHorizontal: spacing.xxl,
  },
});
