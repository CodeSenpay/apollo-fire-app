import { API_BASE_URL, getAuthToken, getUserData } from "@/src/services/apiConfig";
import { io, Socket } from "socket.io-client";

type DeviceEventMap = {
  streamStatus: (payload: {
    deviceId: string;
    status: string;
    updatedAt: number;
  }) => void;
  streamMode: (payload: {
    deviceId: string;
    mode: "local" | "relay";
    updatedAt: number;
  }) => void;
  streamUrl: (payload: {
    deviceId: string;
    streamUrl: string | null;
    updatedAt: number;
  }) => void;
  streamRequest: (payload: {
    deviceId: string;
    requested: boolean;
    updatedAt: number;
  }) => void;
  mlAlert: (payload: {
    deviceId: string;
    alertType: string;
    confidence: number;
    timestamp: number;
    recordedAt: number;
  }) => void;
  servo: (payload: {
    deviceId: string;
    pan: number | null;
    tilt: number | null;
    sequence: number;
    updatedAt: number;
  }) => void;
  servoRecenter: (payload: {
    deviceId: string;
    sequence: number;
    updatedAt: number;
  }) => void;
};

type DeviceEvents = keyof DeviceEventMap;

const deriveDefaultSocketUrl = () => {
  try {
    const url = new URL(API_BASE_URL);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://192.168.1.14:8000";
  }
};

const SOCKET_URL = (process.env.EXPO_PUBLIC_RELAY_SOCKET_URL || deriveDefaultSocketUrl()).replace(/\/$/, "");

let socket: Socket | null = null;
let connecting = false;
const activeSubscriptions = new Map<string, Partial<DeviceEventMap>>();

export type NotificationPayload = {
  id: number | null;
  userId: string | null;
  deviceId: string | null;
  title: string | null;
  body: string | null;
  notificationType: string | null;
  sentAt: string;
};

type NotificationHandler = (payload: NotificationPayload) => void;

const notificationHandlers = new Set<NotificationHandler>();
let notificationListener: ((payload: NotificationPayload) => void) | null = null;
let subscribedUserId: string | null = null;

type ListenerEntry = {
  event: DeviceEvents;
  listener: (...args: any[]) => void;
};

const deviceListeners = new Map<string, ListenerEntry[]>();

const detachListeners = (deviceId: string) => {
  const listeners = deviceListeners.get(deviceId);
  const activeSocket = socket;
  if (!listeners || !activeSocket) return;
  listeners.forEach(({ event, listener }) => {
    activeSocket.off(event, listener);
  });
  deviceListeners.delete(deviceId);
};

const registerDeviceListeners = (
  deviceId: string,
  handlers: Partial<DeviceEventMap>
) => {
  const activeSocket = socket;
  if (!activeSocket) return;

  detachListeners(deviceId);

  const entries: ListenerEntry[] = [];

  (Object.entries(handlers) as Array<[DeviceEvents, DeviceEventMap[DeviceEvents]]>).forEach(
    ([event, handler]) => {
      if (!handler) return;

      const listener = (...args: any[]) => {
        const payload = args[0];
        if (payload?.deviceId === deviceId) {
          (handler as (payload: any) => void)(payload);
        }
      };

      activeSocket.on(event, listener);
      entries.push({ event, listener });
    }
  );

  if (entries.length > 0) {
    deviceListeners.set(deviceId, entries);
  }
};

export const getSocket = () => socket;

export const connectSocket = async () => {
  if (socket || connecting) return socket;
  connecting = true;

  const [token, user] = await Promise.all([getAuthToken(), getUserData()]);

  socket = io(SOCKET_URL, {
    transports: ["websocket"],
    auth: token ? { token } : undefined,
    query: user?.id ? { userId: user.id } : undefined,
  });

  socket.on("connect", () => {
    connecting = false;
    if (user?.id) {
      subscribedUserId = user.id;
      socket?.emit("subscribeToUser", user.id);
    }
    ensureNotificationListener();
    activeSubscriptions.forEach((handlers, deviceId) => {
      performSubscription(deviceId, handlers);
    });
  });

  socket.on("disconnect", () => {
    connecting = false;
    deviceListeners.clear();
    notificationListener = null;
  });

  socket.on("connect_error", (error: Error) => {
    connecting = false;
    console.warn("Socket connection error:", error.message);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (!socket) return;
  deviceListeners.forEach((listeners, device) => {
    listeners.forEach(({ event, listener }) => {
      socket!.off(event, listener);
    });
  });
  deviceListeners.clear();
  if (notificationListener) {
    socket.off("notification", notificationListener);
    notificationListener = null;
  }
  socket.disconnect();
  socket = null;
  connecting = false;
  activeSubscriptions.clear();
  notificationHandlers.clear();
  subscribedUserId = null;
};

const performSubscription = (
  deviceId: string,
  handlers: Partial<DeviceEventMap>
) => {
  const activeSocket = socket;
  if (!activeSocket || !activeSocket.connected) return;
  activeSocket.emit("subscribeToDevice", deviceId);
  registerDeviceListeners(deviceId, handlers);
};

export const subscribeToDevice = (
  deviceId: string,
  handlers: Partial<DeviceEventMap>
) => {
  if (!deviceId) return;

  activeSubscriptions.set(deviceId, handlers);

  if (!socket) {
    connectSocket();
    return;
  }

  if (!socket.connected) {
    connectSocket();
    return;
  }

  performSubscription(deviceId, handlers);
};

export const unsubscribeFromDevice = (deviceId: string) => {
  if (!socket) return;
  socket.emit("unsubscribeFromDevice", deviceId);
  detachListeners(deviceId);
  activeSubscriptions.delete(deviceId);
};

const ensureNotificationListener = () => {
  if (!socket || notificationListener) return;

  const listener = (payload: NotificationPayload) => {
    notificationHandlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        console.warn("Notification handler error:", error);
      }
    });
  };

  socket.on("notification", listener);
  notificationListener = listener;
};

export const subscribeToNotifications = async (handler: NotificationHandler) => {
  if (notificationHandlers.has(handler)) {
    return;
  }

  notificationHandlers.add(handler);

  const activeSocket = socket;

  if (activeSocket && activeSocket.connected) {
    ensureNotificationListener();

    if (!subscribedUserId) {
      const user = await getUserData();
      if (user?.id) {
        subscribedUserId = user.id;
        activeSocket.emit("subscribeToUser", user.id);
      }
    }

    return;
  }

  await connectSocket();
  ensureNotificationListener();

  if (socket?.connected && !subscribedUserId) {
    const user = await getUserData();
    if (user?.id) {
      subscribedUserId = user.id;
      socket.emit("subscribeToUser", user.id);
    }
  }
};

export const unsubscribeFromNotifications = (handler: NotificationHandler) => {
  notificationHandlers.delete(handler);

  if (notificationHandlers.size === 0 && socket && notificationListener) {
    socket.off("notification", notificationListener);
    notificationListener = null;
  }
};

const clampServoAngle = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return Math.min(180, Math.max(0, value));
};

const ensureSocket = async (): Promise<Socket | null> => {
  await connectSocket();
  if (socket && socket.connected) {
    return socket;
  }
  return null;
};

export const emitServoCommand = async (
  deviceId: string,
  payload: { pan?: number; tilt?: number }
) => {
  if (!deviceId) return;

  const activeSocket = await ensureSocket();
  if (!activeSocket) return;

  const command: { deviceId: string; pan?: number; tilt?: number } = { deviceId };
  const clampedPan = clampServoAngle(payload.pan);
  const clampedTilt = clampServoAngle(payload.tilt);

  if (typeof clampedPan === "number") {
    command.pan = clampedPan;
  }
  if (typeof clampedTilt === "number") {
    command.tilt = clampedTilt;
  }

  if (typeof command.pan !== "number" && typeof command.tilt !== "number") {
    return;
  }

  activeSocket.emit("servoCommand", command);
};

export const emitServoRecenter = async (deviceId: string) => {
  if (!deviceId) return;

  const activeSocket = await ensureSocket();
  if (!activeSocket) return;

  activeSocket.emit("servoRecenter", { deviceId });
};
