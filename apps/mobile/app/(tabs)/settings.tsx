import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import type { User, Tenant } from "@osp/shared/types";
import { api } from "@/lib/api";
import { clearTokens } from "@/lib/auth";
import { colors, spacing, borderRadius, fontSize } from "@/constants/theme";

export default function SettingsScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const [userResult, tenantResult] = await Promise.all([
        api.get<User>("/api/v1/users/me"),
        api.get<Tenant>("/api/v1/tenants/current"),
      ]);

      if (userResult.success && userResult.data) {
        setUser(userResult.data);
        setNotificationsEnabled(
          userResult.data.preferences.notificationsEnabled,
        );
      }
      if (tenantResult.success && tenantResult.data) {
        setTenant(tenantResult.data);
      }
    } catch {
      // Silently fail - user can still use logout
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleToggleNotifications = useCallback(
    async (value: boolean) => {
      setNotificationsEnabled(value);
      try {
        await api.put("/api/v1/users/me/preferences", {
          notificationsEnabled: value,
        });
      } catch {
        setNotificationsEnabled(!value);
        Alert.alert("Error", "Failed to update notification preferences.");
      }
    },
    [],
  );

  const handleLogout = useCallback(() => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await clearTokens();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.displayName?.charAt(0)?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.displayName ?? "Unknown"}
            </Text>
            <Text style={styles.profileEmail}>{user?.email ?? ""}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>
                {user?.role?.toUpperCase() ?? ""}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Tenant Section */}
      {tenant && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organization</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Name" value={tenant.name} />
            <InfoRow label="Plan" value={tenant.plan.toUpperCase()} />
            <InfoRow label="Max Cameras" value={String(tenant.maxCameras)} />
            <InfoRow
              label="Retention"
              value={`${tenant.retentionDays} days`}
            />
          </View>
        </View>
      )}

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.infoCard}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Push Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: colors.border, true: colors.primaryDark }}
              thumbColor={
                notificationsEnabled ? colors.primary : colors.textMuted
              }
            />
          </View>
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>OSP Mobile v0.1.0</Text>
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
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.lg,
  },
  avatarText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: "700",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: "600",
  },
  profileEmail: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.sm,
  },
  roleText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  switchLabel: {
    color: colors.text,
    fontSize: fontSize.md,
  },
  logoutButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.error,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  logoutText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  version: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: "center",
    marginTop: spacing.xxl,
  },
});
