import { useEffect, useRef } from "react";
import { Tabs } from "expo-router";
import { Text, StyleSheet } from "react-native";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import { registerForPushNotifications } from "@/lib/push-notifications";
import { transformTenant } from "@/lib/transforms";
import type { Tenant } from "@osp/shared/types";

function TabIcon({ name, focused }: { readonly name: string; readonly focused: boolean }) {
  const icons: Record<string, string> = {
    Cameras: "[]",
    Events: "!",
    Recordings: "R",
    Settings: "*",
  };
  return (
    <Text style={[styles.icon, focused && styles.iconFocused]}>
      {icons[name] ?? "?"}
    </Text>
  );
}

const tabIconCameras = ({ focused }: { readonly focused: boolean }) => (
  <TabIcon name="Cameras" focused={focused} />
);

const tabIconEvents = ({ focused }: { readonly focused: boolean }) => (
  <TabIcon name="Events" focused={focused} />
);

const tabIconRecordings = ({ focused }: { readonly focused: boolean }) => (
  <TabIcon name="Recordings" focused={focused} />
);

const tabIconSettings = ({ focused }: { readonly focused: boolean }) => (
  <TabIcon name="Settings" focused={focused} />
);

export default function TabsLayout() {
  const didRegisterRef = useRef(false);

  useEffect(() => {
    if (didRegisterRef.current) return;
    didRegisterRef.current = true;

    async function registerPushToken(): Promise<void> {
      try {
        const tenantResult = await api.get<Tenant>("/api/v1/tenants/current");
        if (!tenantResult.success || !tenantResult.data) return;

        const tenant = transformTenant(tenantResult.data);
        if (!tenant.settings.notificationPreferences.pushEnabled) return;

        const token = await registerForPushNotifications();
        if (!token) return;

        const result = await api.patch<{ saved: boolean; pushToken: string }>(
          "/api/v1/users/push-token",
          { pushToken: token },
        );

        if (!result.success) {
          // Endpoint errors are still actionable; keep logging to surface issues.
          // eslint-disable-next-line no-console
          console.warn("[push] Failed to save push token", result.error);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[push] Push token registration failed", err);
      }
    }

    void registerPushToken();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: "600",
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 85,
          paddingBottom: 30,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Cameras",
          tabBarIcon: tabIconCameras,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: tabIconEvents,
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          title: "Recordings",
          tabBarIcon: tabIconRecordings,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: tabIconSettings,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: "700",
  },
  iconFocused: {
    color: colors.primary,
  },
});
