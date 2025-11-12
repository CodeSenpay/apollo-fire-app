import { useEffect, useMemo, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken } from '@/src/services/apiConfig';
import {
  NotificationPayload,
  subscribeToNotifications,
  unsubscribeFromNotifications,
} from '@/src/state/socket';
import { APP_ALERT_TITLE } from '@/src/constants/branding';
import { useRouter } from 'expo-router';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  } as Notifications.NotificationBehavior),
});

const MAX_TOKEN_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const resolveExpoProjectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;

export const useNotifications = (userId?: string | null) => {
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const router = useRouter();

  const registerForPushNotifications = async () => {
    if (!userId) {
      return;
    }

    try {
      if (!Device.isDevice) {
        console.warn('Push notifications are only available on physical devices');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('Push notification permissions not granted; falling back to local notifications');
        return;
      }

      const projectId = resolveExpoProjectId();
      if (!projectId) {
        console.warn('Expo project ID not found. Ensure it is configured for push notifications.');
      }

      let token: string | null = null;
      let lastError: unknown;

      for (let attempt = 1; attempt <= MAX_TOKEN_ATTEMPTS; attempt += 1) {
        try {
          const response = projectId
            ? await Notifications.getExpoPushTokenAsync({ projectId })
            : await Notifications.getExpoPushTokenAsync();
          token = response.data;
          break;
        } catch (tokenError) {
          lastError = tokenError;
          const message = tokenError instanceof Error ? tokenError.message : String(tokenError);
          console.warn(`Failed to fetch Expo push token (attempt ${attempt}/${MAX_TOKEN_ATTEMPTS}):`, message);

          if (attempt < MAX_TOKEN_ATTEMPTS && /SERVICE_NOT_AVAILABLE/i.test(message)) {
            await sleep(500 * attempt);
            continue;
          }

          throw tokenError;
        }
      }

      if (!token) {
        console.warn('Unable to obtain Expo push token after retries', lastError);
        return;
      }

      console.log('Expo Push Token:', token);

      try {
        await registerPushToken(token, userId);
        console.log('Push token registered with backend');
      } catch (error) {
        console.error('Failed to register push token with backend:', error);
      }
    } catch (error) {
      console.error('Error in registerForPushNotifications:', error);
    }
  };

  const configureLocalNotifications = async () => {
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default Channel',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
          enableLights: true,
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
        });
        console.log('Notification channel created successfully');
      }

      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const permissionResult = await Notifications.requestPermissionsAsync();
        if (permissionResult.status !== 'granted') {
          console.warn('Notification permissions not granted');
        }
      }
    } catch (error) {
      console.error('Error configuring local notifications:', error);
    }
  };

  // Schedule a local notification
  const scheduleLocalNotification = useMemo(
    () =>
      async (title: string, body: string, data: Record<string, unknown> = {}) => {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data,
            sound: 'default',
          },
          trigger: null, // Send immediately
        });
      },
    []
  );

  const handleRealtimeNotification = useMemo(
    () =>
      ({
        title,
        body,
        notificationType,
        deviceId,
        deviceName,
        deliveryMethod,
        deliveryMeta,
      }: NotificationPayload) => {
        const safeTitle = title ?? APP_ALERT_TITLE;
        const safeBody =
          body ??
          (notificationType === 'ml_alert'
            ? 'Potential fire detected. Check device immediately.'
            : 'You have a new notification.');

        if (deliveryMethod === 'expo' && deliveryMeta?.expoDelivered) {
          console.log('Skipping local notification; Expo delivery confirmed');
          return;
        }

        scheduleLocalNotification(safeTitle, safeBody, {
          notificationType,
          deviceId,
          deviceName,
          fallback: true,
        });
      },
    [scheduleLocalNotification]
  );

  useEffect(() => {
    let cancelled = false;

    const setupNotifications = async () => {
      await registerForPushNotifications();
      if (cancelled) return;
      await configureLocalNotifications();
      if (cancelled) return;

      // Set up notification listeners
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
        // Handle the notification when the app is in the foreground
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification response:', response);
        const content = response.notification.request.content;
        const rawData = content.data as Record<string, unknown> | undefined;
        let rawDeviceId = rawData?.deviceId ?? rawData?.device_id;
        let rawDeviceName = rawData?.deviceName ?? rawData?.device_name;

        if (typeof rawDeviceId !== 'string' || !rawDeviceId.trim()) {
          const trigger = response.notification.request.trigger as
            | { remoteMessage?: { data?: Record<string, unknown> | string } }
            | undefined;
          const remotePayload = trigger?.remoteMessage?.data;
          if (remotePayload) {
            if (typeof remotePayload === 'string') {
              try {
                const parsed = JSON.parse(remotePayload) as Record<string, unknown>;
                const parsedDeviceId = parsed.deviceId ?? parsed.device_id;
                if (typeof parsedDeviceId === 'string' && parsedDeviceId.trim()) {
                  rawDeviceId = parsedDeviceId;
                }
                const parsedDeviceName = parsed.deviceName ?? parsed.device_name;
                if (typeof parsedDeviceName === 'string' && parsedDeviceName.trim()) {
                  rawDeviceName = parsedDeviceName;
                }
              } catch (error) {
                console.warn('Failed to parse remoteMessage data string:', error);
              }
            } else if (typeof remotePayload === 'object') {
              const parsedDeviceId = (remotePayload as Record<string, unknown>).deviceId ??
                (remotePayload as Record<string, unknown>).device_id;
              if (typeof parsedDeviceId === 'string' && parsedDeviceId.trim()) {
                rawDeviceId = parsedDeviceId;
              }
              const parsedDeviceName = (remotePayload as Record<string, unknown>).deviceName ??
                (remotePayload as Record<string, unknown>).device_name;
              if (typeof parsedDeviceName === 'string' && parsedDeviceName.trim()) {
                rawDeviceName = parsedDeviceName;
              }
            }
          }
        }

        if (typeof rawDeviceId !== 'string' || !rawDeviceId.trim()) {
          const dataString = (content as unknown as { dataString?: unknown })?.dataString;
          if (typeof dataString === 'string') {
            try {
              const parsed = JSON.parse(dataString) as Record<string, unknown>;
              const parsedDeviceId = parsed.deviceId ?? parsed.device_id;
              if (typeof parsedDeviceId === 'string' && parsedDeviceId.trim()) {
                rawDeviceId = parsedDeviceId;
              }
              const parsedDeviceName = parsed.deviceName ?? parsed.device_name;
              if (typeof parsedDeviceName === 'string' && parsedDeviceName.trim()) {
                rawDeviceName = parsedDeviceName;
              }
            } catch (error) {
              console.warn('Failed to parse notification dataString:', error);
            }
          }
        }

        if (typeof rawDeviceId === 'string' && rawDeviceId.trim()) {
          const params: { id: string; name?: string } = { id: rawDeviceId.trim() };
          if (typeof rawDeviceName === 'string' && rawDeviceName.trim()) {
            params.name = rawDeviceName.trim();
          }

          router.push({ pathname: '/device/[id]', params });
        } else {
          console.warn('Notification response missing deviceId, cannot navigate');
        }
      });
    };

    setupNotifications();

    subscribeToNotifications(handleRealtimeNotification);

    // Clean up listeners on unmount
    return () => {
      cancelled = true;
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      unsubscribeFromNotifications(handleRealtimeNotification);
    };
  }, [userId, handleRealtimeNotification, router]);

  // Expose methods that can be used by components
  return {
    scheduleLocalNotification,
    // Add more methods as needed
  };
};
