import { isPinEnabled } from "@/src/services/pin"; // adjust path if needed
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect } from "react";
import "./global.css";

import { PinGateProvider, usePinGate } from "@/src/state/pinGate";

function GateWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { unlocked } = usePinGate();

  useEffect(() => {
    (async () => {
      const pinOn = await isPinEnabled();
      // If PIN is on and not yet unlocked this session, force the verify screen
      if (pinOn && !unlocked && pathname !== "/login") {
        console.log(`IF 1: ${pinOn && !unlocked && pathname !== "/login"}`);
        router.replace("/login");
      }
      // If PIN is off and we somehow are on /pin-verify, go home
      if (!pinOn && pathname === "/login") {
        console.log(`IF 2: ${!pinOn && pathname === "/login"}`);
        router.replace("/dashboard");
      }
    })();
  }, [pathname, unlocked]);

  return null;
}

export default function RootLayout() {
  return (
    <PinGateProvider>
      <GateWatcher />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{ presentation: "fullScreenModal", headerShown: false }}
        />
        <Stack.Screen
          name="dashboard"
          options={{ headerShown: false, statusBarHidden: true }}
        />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="addsecurity" options={{ headerShown: false }} />
      </Stack>
    </PinGateProvider>
  );
}
