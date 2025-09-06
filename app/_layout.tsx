// app/_layout.tsx
import { isPinEnabled } from "@/src/services/pin"; // adjust path if needed
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import "./global.css";

import { AuthProvider, useAuth } from "@/src/state/pinGate";

// 🔔 MODIFIED: Firebase and notifications imports
import { auth, db } from "@/src/services/firebaseConfig";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { get, ref, set } from "firebase/database";
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

// 🔔 NEW: This function now checks and saves the token directly to Firebase RTDB
async function registerTokenInFirebase(token: string) {
  const user = auth.currentUser;
  if (!user) {
    console.log("User not logged in, cannot register FCM token.");
    return;
  }

  const userId = user.uid;
  const tokenRef = ref(db, `users/${userId}/fcmToken`);

  try {
    const snapshot = await get(tokenRef);
    const existingToken = snapshot.val();

    // Only update Firebase if the token is new or doesn't exist yet
    if (existingToken === token) {
      console.log("FCM token is already up to date in Firebase.");
      return;
    }

    await set(tokenRef, token);
    console.log("Successfully saved new FCM token for user:", userId);
  } catch (error) {
    console.error("Error saving FCM token to Firebase:", error);
  }
}

// Get the push token (no changes here)
async function getPushNotificationToken(): Promise<string | null> {
  if (!Device.isDevice) {
    Alert.alert("Push notifications are only supported on physical devices.");
    return null;
  }

  let { status: finalStatus } = await Notifications.getPermissionsAsync();
  if (finalStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    Alert.alert("Permission not granted for push notifications.");
    return null;
  }

  // Use your Expo project ID
  return (await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  })).data;
}

// Main function to coordinate the process (now uses the new Firebase function)
export async function registerForPushNotificationsAsync() {
  try {
    const token = await getPushNotificationToken();
    if (token) {
      await registerTokenInFirebase(token);
    }
  } catch (error) {
    console.error(
      "An error occurred during push notification registration:",
      error
    );
  }
}

// This component now handles all auth/PIN redirection and push registration logic
function GateWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, loading, unlocked } = useAuth();
  const [pinOn, setPinOn] = useState<boolean | null>(null);
  // 🔔 NEW: Ref to ensure push registration only happens once per session
  const pushRegistrationAttempted = useRef(false);

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
      // If user signs out, allow them to re-register on next login
      pushRegistrationAttempted.current = false;
      if (!isAuthScreen) {
        router.replace("/auth");
      }
      return;
    }

    // 🔔 NEW LOGIC:
    // Once the user is authenticated, attempt to register for push notifications.
    // The ref ensures this only runs once per authenticated session.
    if (!pushRegistrationAttempted.current) {
      pushRegistrationAttempted.current = true; // Mark as attempted
      registerForPushNotificationsAsync().catch((e) =>
        console.warn("Push registration failed:", e)
      );
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
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
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

    // 🔔 REMOVED: Push registration is now handled by GateWatcher

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("Notification received (foreground):", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("Notification tapped:", response);
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
    <AuthProvider>
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
        <Stack.Screen
          name="device/settings"
          options={{
            headerShown: true,
            headerTitle: "Device Settings",
            presentation: 'modal'
          }}
        />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="addsecurity" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}