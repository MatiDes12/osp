import { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import type { Tenant } from "@osp/shared/types";
import { api } from "@/lib/api";
import { getAccessToken, clearTokens } from "@/lib/auth";
import { transformTenant } from "@/lib/transforms";
import { colors, spacing, borderRadius, fontSize } from "@/constants/theme";

interface JwtUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1]!;
    const padded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractUserFromJwt(token: string): JwtUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const meta = (payload["user_metadata"] ?? {}) as Record<string, unknown>;

  return {
    id: (payload["sub"] as string) ?? "",
    email: (payload["email"] as string) ?? "",
    displayName:
      (meta["display_name"] as string) ?? (payload["email"] as string) ?? "",
    role: (meta["role"] as string) ?? "viewer",
  };
}

export default function SettingsScreen() {
  const [user, setUser] = useState<JwtUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      // Extract user info from JWT
      const token = await getAccessToken();
      if (token) {
        const jwtUser = extractUserFromJwt(token);
        if (jwtUser) {
          setUser(jwtUser);
        }
      }

      // Fetch tenant from API
      const tenantResult = await api.get<Tenant>("/api/v1/tenants/current");
      if (tenantResult.success && tenantResult.data) {
        setTenant(transformTenant(tenantResult.data as unknown as Record<string, unknown>));
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
            <InfoRow label="Retention" value={`${tenant.retentionDays} days`} />
          </View>
        </View>
      )}

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
