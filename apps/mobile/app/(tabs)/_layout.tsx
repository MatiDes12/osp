import { Tabs } from "expo-router";
import { Text, StyleSheet } from "react-native";
import { colors } from "@/constants/theme";

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

export default function TabsLayout() {
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
          tabBarIcon: ({ focused }) => <TabIcon name="Cameras" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ focused }) => <TabIcon name="Events" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="recordings"
        options={{
          title: "Recordings",
          tabBarIcon: ({ focused }) => <TabIcon name="Recordings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon name="Settings" focused={focused} />,
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
