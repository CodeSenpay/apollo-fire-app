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
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'

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


// Ask permission & get Expo push token
function extractExpoToken(raw:string) {
  if (!raw) return null
  const m = raw.match(/\[([^\]]+)\]/)
  return m ? m[1] : null
}

export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      Alert.alert('Push notifications only work on a physical device.')
      return null
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync()
    let finalStatus = existingStatus
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync()
      finalStatus = status
    }
    if (finalStatus !== 'granted') {
      Alert.alert('Permission not granted for push notifications.')
      return null
    }

    const rawToken = (await Notifications.getExpoPushTokenAsync()).data
    console.log('Expo push token raw', rawToken)

    const token = extractExpoToken(rawToken) || rawToken
    console.log('Expo push token extracted', token)

    const userId = await generateUserId()

    const PUSH_TOKEN_KEY = 'push_token'
    const lastSentToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
    console.log('lastSentToken', lastSentToken)

    if (token === lastSentToken) {
      console.log('Push token already up to date. Skipping register.')
      return { token, userId }
    }

    const controller = new AbortController()
    const timeoutMs = 10000
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch('https://apollo-relay-server.onrender.com/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, token }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      let bodyText = '<no body>'
      try {
        bodyText = await response.text()
      } catch (e) {
        bodyText = '<failed to read body>'
      }

      console.log('register-token status', response.status, 'body', bodyText)

      if (response.ok) {
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token)
        console.log('Saved push token to SecureStore')
      } else {
        console.warn('Server returned error status', response.status)
      }
    } catch (err:any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        console.error('register-token aborted by timeout')
      } else {
        console.error('register-token fetch error', err)
      }
    }

    return { token, userId }
  } catch (err) {
    console.error('registerForPushNotificationsAsync outer error', err)
    return null
  }
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
