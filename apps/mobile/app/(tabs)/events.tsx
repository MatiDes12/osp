import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import type { OSPEvent } from "@osp/shared/types";
import { api } from "@/lib/api";
import { EventRow } from "@/components/EventRow";
import { colors, spacing, fontSize } from "@/constants/theme";

export default function EventsScreen() {
  const [events, setEvents] = useState<readonly OSPEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await api.get<OSPEvent[]>("/api/v1/events", {
        limit: 50,
        sortBy: "detectedAt",
        sortOrder: "desc",
      });
      if (result.success && result.data) {
        setEvents(result.data);
        setError(null);
      } else {
        setError(result.error?.message ?? "Failed to load events.");
      }
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleEventPress = useCallback((event: OSPEvent) => {
    Alert.alert(
      `${event.type} Event`,
      `Camera: ${event.cameraName}\nSeverity: ${event.severity}\nDetected: ${new Date(event.detectedAt).toLocaleString()}${event.zoneName ? `\nZone: ${event.zoneName}` : ""}`,
    );
  }, []);

  const handleRefresh = useCallback(() => {
    fetchEvents(true);
  }, [fetchEvents]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchEvents()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventRow event={item} onPress={handleEventPress} />
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
            <Text style={styles.emptyTitle}>No Events</Text>
            <Text style={styles.emptySubtitle}>
              Events will appear here when detected by your cameras.
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
  list: {
    paddingVertical: spacing.sm,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.md,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  retryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
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
