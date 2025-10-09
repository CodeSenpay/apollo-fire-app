import { getAuthToken, getUserData } from "@/src/services/apiConfig";
import { io, Socket } from "socket.io-client";

type DeviceEventMap = {
  sensorData: (payload: {
    deviceId: string;
    gasValue: number;
    isFlameDetected: boolean;
    isCriticalAlert: boolean;
    timestamp: number;
    updatedAt: number;
  }) => void;
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
};

type DeviceEvents = keyof DeviceEventMap;

const SOCKET_URL = (process.env.EXPO_PUBLIC_RELAY_SOCKET_URL || "http://192.168.1.14:8000").replace(/\/$/, "");

let socket: Socket | null = null;
let connecting = false;
const activeSubscriptions = new Map<string, Partial<DeviceEventMap>>();

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
    activeSubscriptions.forEach((handlers, deviceId) => {
      performSubscription(deviceId, handlers);
    });
  });

  socket.on("disconnect", () => {
    connecting = false;
    deviceListeners.clear();
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
  socket.disconnect();
  socket = null;
  connecting = false;
  activeSubscriptions.clear();
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
