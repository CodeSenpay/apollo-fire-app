import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import {
  NotificationPayload,
  subscribeToNotifications,
  unsubscribeFromNotifications,
  connectSocket,
} from "@/src/state/socket";

const NOTIFICATION_THROTTLE_MS = 5000;
const recentNotifications = new Map<string, number>();

const shouldDisplayNotification = (payload: NotificationPayload) => {
  const title = payload.title || "";
  const body = payload.body || "";
  const type = payload.notificationType || "";
  const deviceId = payload.deviceId || "";
  const key = `${deviceId}|${type}|${title}|${body}`;
  const now = Date.now();

  for (const [storedKey, timestamp] of recentNotifications) {
    if (now - timestamp > NOTIFICATION_THROTTLE_MS) {
      recentNotifications.delete(storedKey);
    }
  }

  const lastShown = recentNotifications.get(key);
  if (lastShown && now - lastShown < NOTIFICATION_THROTTLE_MS) {
    return false;
  }

  recentNotifications.set(key, now);
  return true;
};

const showNotificationBanner = async (payload: NotificationPayload) => {
  if (!shouldDisplayNotification(payload)) {
    return;
  }

  const title = payload.title || "Notification";
  const body = payload.body || "";

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: {
        notificationId: payload.id,
        deviceId: payload.deviceId,
        notificationType: payload.notificationType,
        sentAt: payload.sentAt,
      },
      sound: "default",
    },
    trigger: null,
  });
};

export const useNotifications = () => {
  useEffect(() => {
    let isMounted = true;
    const handler = (payload: NotificationPayload) => {
      if (!isMounted) return;
      showNotificationBanner(payload).catch((error) => {
        console.warn("Failed to present local notification:", error);
      });
    };

    const setup = async () => {
      await connectSocket();
      await subscribeToNotifications(handler);
    };

    setup().catch((error) => {
      console.warn("Failed to subscribe to notifications:", error);
    });

    return () => {
      isMounted = false;
      unsubscribeFromNotifications(handler);
    };
  }, []);
};
