// app/_layout.tsx
import { isPinEnabled } from "@/src/services/pin"; // adjust path if needed
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import "./global.css";

import { PinGateProvider, usePinGate } from "@/src/state/pinGate";

// 🔔 NEW: notifications imports
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert, Platform } from "react-native";

// Show notifications even when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification:
    async (): Promise<Notifications.NotificationBehavior> => ({
      shouldShowAlert: true, // show alert in-app
      shouldPlaySound: true, // play sound
      shouldSetBadge: true, // update app icon badge
      shouldShowBanner: true, // iOS: show banner at the top
      shouldShowList: true, // iOS: show in notification center list
    }),
});

// Ask permission & get Expo push token
async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    Alert.alert("Push notifications only work on a physical device.");
    return null;
  }

  // iOS: request permissions (Android usually granted by default)
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") {
    Alert.alert("Permission not granted for push notifications.");
    return null;
  }

  // Get the Expo push token
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log("Expo push token:", token);

  // TODO: Save this token to your DB so your Cloud Function can send to it:
  // e.g., Realtime DB path: /users/{uid}/expoPushTokens/{token} = true

  return token;
}

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
      // If PIN is off and we somehow are on /login, go home
      if (!pinOn && pathname === "/login") {
        console.log(`IF 2: ${!pinOn && pathname === "/login"}`);
        router.replace("/dashboard");
      }
    })();
  }, [pathname, unlocked]);

  return null;
}

export default function RootLayout() {
  // 🔔 NEW: refs to clean up listeners
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // ANDROID: Create a high-importance channel once on startup
    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("critical", {
        name: "Critical Alerts",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: "default",
        lockscreenVisibility:
          Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    // Register for push + get token
    registerForPushNotificationsAsync().catch((e) =>
      console.warn("Push registration failed:", e)
    );

    // Foreground notifications (app open)
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        // Optional: show a toast/snackbar, update in-app state, etc.
        console.log("Notification received (foreground):", notification);
      });

    // When user taps a notification (from bg/terminated)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("Notification tapped:", response);
        // Example: deep link by deviceId in payload:
        // const deviceId = response.notification.request.content.data?.deviceId as string | undefined;
        // if (deviceId) router.push(`/device/${deviceId}`);
      });

    return () => {
      if (notificationListener.current)
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      if (responseListener.current)
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

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
