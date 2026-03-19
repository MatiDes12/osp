import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      try {
        const res = await fetch("https://www.google.com/generate_204", {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        });
        if (mounted) setIsOffline(!res.ok);
      } catch {
        if (mounted) setIsOffline(true);
      }
    };

    check();
    const interval = setInterval(check, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>⚠ No connection — showing cached data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#f59e0b",
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  text: {
    color: "#1a1a1a",
    fontSize: 12,
    fontWeight: "600",
  },
});
