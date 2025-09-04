// app/_layout.tsx
import { isPinEnabled } from "@/src/services/pin"; // adjust path if needed
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import "./global.css";

import { AuthProvider, useAuth } from "@/src/state/pinGate";

// 🔔 NEW: notifications imports
import * as Crypto from 'expo-crypto';
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from 'expo-secure-store';
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

async function generateUserId() {
  const KEY = 'user_id'
  const existing = await SecureStore.getItemAsync(KEY)
  if (existing) return existing

  try {
    // returns a Uint8Array
    const bytes = await Crypto.getRandomBytesAsync(16)
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
    const id = `user_${hex}`
    await SecureStore.setItemAsync(KEY, id)
    console.log('generated userId', id)
    return id
  } catch (err) {
    console.error('generateUserId error', err)
    // Fallback low-entropy id to avoid blocking flow
    const fallback = `user_fallback_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    await SecureStore.setItemAsync(KEY, fallback)
    console.log('generated fallback userId', fallback)
    return fallback
  }
}

// 2. Send the token to the server
async function sendTokenToServer(token: string) {
  const userId = await generateUserId();
  const PUSH_TOKEN_KEY = 'push_token';
  const lastSentToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);

  if (token === lastSentToken) {
    console.log('Push token is already up to date.');
    return;
  }

  try {
    const response = await fetch('https://apollo-relay-server.onrender.com/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token }),
    });

    if (response.ok) {
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
      console.log('Successfully saved new push token.');
    } else {
      console.error('Failed to register token with server:', await response.text());
    }
  } catch (error) {
    console.error('Error sending push token to server:', error);
  }
}

// 1. Get the push token
async function getPushNotificationToken(): Promise<string | null> {
  if (!Device.isDevice) {
    Alert.alert('Push notifications are only supported on physical devices.');
    return null;
  }

  let { status: finalStatus } = await Notifications.getPermissionsAsync();
  if (finalStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    Alert.alert('Permission not granted for push notifications.');
    return null;
  }

  return (await Notifications.getExpoPushTokenAsync()).data;
}

// 3. The main function to coordinate the process
export async function registerForPushNotificationsAsync() {
  try {
    const token = await getPushNotificationToken();
    if (token) {
      await sendTokenToServer(token);
    }
  } catch (error) {
    console.error('An error occurred during push notification registration:', error);
  }
}


// This component now handles all auth/PIN redirection logic
function GateWatcher() {
  const router = useRouter();
  const pathname = usePathname();
  // Get all relevant state from the AuthProvider
  const { isAuthenticated, loading, unlocked } = useAuth();
  const [pinOn, setPinOn] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if the PIN is enabled once
    isPinEnabled().then(setPinOn);
  }, []);

  useEffect(() => {
    // Wait until Firebase has checked the auth state and we know if PIN is enabled
    if (loading || pinOn === null) {
      return;
    }

    const isAuthScreen = pathname === "/auth";
    const isPinScreen = pathname === "/login";

    if (!isAuthenticated) {
      // If the user is not logged in, they must be on the auth screen.
      if (!isAuthScreen) {
        router.replace("/auth");
      }
      return;
    }

    // If we reach here, the user is authenticated with Firebase.
    // Now, we handle the PIN lock logic.
    if (pinOn && !unlocked) {
      // If PIN is required and the app is locked, force the PIN screen.
      if (!isPinScreen) {
        router.replace("/login");
      }
    } else if (isAuthScreen || isPinScreen) {
      // If the user is authenticated and unlocked (or has no PIN),
      // they should not be on the auth or PIN screen. Send them to the dashboard.
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, pinOn, unlocked, pathname]);

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
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="addsecurity" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}