// app/_layout.tsx
import { isPinEnabled } from "@/src/services/pin"; // adjust path if needed
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import "./global.css";

import { AuthProvider, useAuth } from "@/src/state/pinGate";
import { useNotifications } from "@/src/hooks/useNotifications";

// This component now handles all auth/PIN redirection and push registration logic
function GateWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, loading, unlocked, user } = useAuth();
  const [pinOn, setPinOn] = useState<boolean | null>(null);
  useNotifications(user?.id ?? null);

  useEffect(() => {
    isPinEnabled().then(setPinOn);
  }, []);

  useEffect(() => {
    if (loading || pinOn === null) {
      return;
    }

    const isAuthScreen = pathname === "/auth";
    const isPinScreen = pathname === "/login";

    if (!isAuthenticated) {
      if (!isAuthScreen) {
        router.replace("/auth");
      }
      return;
    }

    if (pinOn && !unlocked) {
      if (!isPinScreen) {
        router.replace("/login");
      }
    } else if (isAuthScreen || isPinScreen) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, pinOn, unlocked, pathname]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <GateWatcher />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
     <Stack.Screen
          name="auth"
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
        <Stack.Screen
          name="dashboard"
          options={{ headerShown: false, statusBarHidden: false }}
        />
        <Stack.Screen
          name="device/settings"
          options={{
            headerShown: true,
            headerTitle: "Device Settings",
            presentation: "modal",
          }}
        />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="addsecurity" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
