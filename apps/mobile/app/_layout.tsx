import { useEffect, useState, useCallback } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { isAuthenticated } from "@/lib/auth";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        const authenticated = await isAuthenticated();
        setHasToken(authenticated);
      } catch {
        setHasToken(false);
      } finally {
        setIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutReady = useCallback(async () => {
    if (isReady) {
      await SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0a0a0a" },
          animation: "fade",
        }}
        onLayout={onLayoutReady}
      >
        {hasToken ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)" />
        )}
        <Stack.Screen
          name="camera/[id]"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: "#18181b" },
            headerTintColor: "#ededed",
            headerTitle: "Camera Detail",
            animation: "slide_from_right",
          }}
        />
      </Stack>
    </>
  );
}
