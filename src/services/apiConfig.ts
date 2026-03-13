// API Configuration and Authentication Service
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';

// Configure your API base URL here
const DEFAULT_API_BASE_URL = "http://192.168.1.104:3000/api";
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

// Storage keys
const TOKEN_KEY = 'auth_token'; // SecureStore doesn't need @ prefix
const USER_KEY = '@user_data';

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: {
    userId: string;
  };
}

// Axios instance with interceptors
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Auth token management
export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const setAuthToken = async (token: string): Promise<void> => {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
};

export const removeAuthToken = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
};

// User data management
export const getUserData = async (): Promise<User | null> => {
  try {
    const userData = await AsyncStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

export const setUserData = async (user: User): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (error) {
    console.error('Error setting user data:', error);
  }
};

export const removeUserData = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(USER_KEY);
  } catch (error) {
    console.error('Error removing user data:', error);
  }
};

// Authentication API calls
export const loginAsGuest = async (userIdOverride?: string): Promise<AuthResponse> => {
  // If we already have a token, we might be already logged in
  const existingToken = await getAuthToken();
  const existingUser = await getUserData();
  
  if (existingToken && existingUser && !userIdOverride) {
    return { success: true, token: existingToken, user: { userId: existingUser.id } };
  }

  // Use override if provided (e.g. from Firebase), otherwise use existing user id or generate new
  const userId = userIdOverride || existingUser?.id || `guest_${Math.random().toString(36).substring(7)}`;

  const response = await apiClient.post('/users/login', { userId });
  const data = response.data;

  if (data.success) {
    await setAuthToken(data.token);
    await setUserData({ id: data.user.userId, email: "guest@apollo.io", name: "Guest User" });
  }
  
  return data;
};

export const logout = async (): Promise<void> => {
  try {
    await apiClient.post('/users/logout-user');
  } catch (error) {
    console.error('Logout API call failed:', error);
  } finally {
    await removeAuthToken();
    await removeUserData();
  }
};

export const loginWithEmail = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const response = await apiClient.post('/auth/login', { email, password });
  const data = response.data;

  await setAuthToken(data.token);
  await setUserData({ id: data.user.userId, email, name: data.user.name || email });
  
  return data;
};

export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const response = await apiClient.post('/auth/signup', { email, password });
  const data = response.data;

  await setAuthToken(data.token);
  await setUserData({ id: data.user.userId, email, name: data.user.name || email });
  
  return data;
};

export const getCurrentUser = async (): Promise<User | null> => {
  try {
    const response = await apiClient.get('/auth/me');
    const user = {
      id: response.data.user.userId,
      email: response.data.user.email,
      name: response.data.user.name
    };
    await setUserData(user);
    return user;
  } catch (error) {
    console.error('Error fetching current user:', error);
    return null;
  }
};

// Device API calls
export interface DeviceSummary {
  id: string;
  name: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const getUserDevices = async (): Promise<DeviceSummary[]> => {
  try {
    const response = await apiClient.get('/users/devices');

    if (response.data.success && response.data.devices) {
      return response.data.devices.map((device: any) => ({
        id: device.id,
        name: device.name ?? `Device ${String(device.id).slice(0, 8)}`,
        status: device.status,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      }));
    }
    return [];
  } catch (error) {
    console.error('Error fetching user devices:', error);
    return [];
  }
};

export const renameDevice = async (deviceId: string, name: string): Promise<void> => {
  await apiClient.put(`/users/devices/${deviceId}/name`, { name });
};

export interface NotificationHistoryEntry {
  id: number;
  deviceId: string | null;
  title: string | null;
  body: string | null;
  notificationType: string | null;
  sentAt: string;
}

export interface NotificationHistoryPage {
  notifications: NotificationHistoryEntry[];
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage: number | null;
}

export const getNotificationHistory = async (
  limit = 100,
  page = 1
): Promise<NotificationHistoryPage> => {
  try {
    const response = await apiClient.get('/users/notifications', {
      params: { limit, page }
    });

    if (response.data.success && Array.isArray(response.data.notifications)) {
      return {
        notifications: response.data.notifications as NotificationHistoryEntry[],
        page: typeof response.data.page === 'number' ? response.data.page : page,
        limit: typeof response.data.limit === 'number' ? response.data.limit : limit,
        hasMore: Boolean(response.data.hasMore),
        nextPage: typeof response.data.nextPage === 'number' ? response.data.nextPage : null,
      };
    }

    return { notifications: [], page, limit, hasMore: false, nextPage: null };
  } catch (error) {
    console.error('Error fetching notification history:', error);
    return { notifications: [], page, limit, hasMore: false, nextPage: null };
  }
};

export const isDeviceAvailableForClaim = async (deviceId: string): Promise<boolean> => {
  try {
    const response = await apiClient.get(`/users/devices/${deviceId}/available`);
    return response.data.available === true;
  } catch (error) {
    console.error('Error checking device availability:', error);
    return false;
  }
};

export const claimDevice = async (deviceId: string): Promise<void> => {
  await apiClient.post(`/users/devices/${deviceId}/claim`);
};

export const resetDevice = async (deviceId: string): Promise<void> => {
  await apiClient.post(`/devices/${deviceId}/reset`);
};

export const setStreamMode = async (
  deviceId: string,
  mode: 'local' | 'relay'
): Promise<void> => {
  await apiClient.put(`/devices/${deviceId}/stream-mode`, { mode });
};

export const requestStream = async (
  deviceId: string,
  requested: boolean
): Promise<void> => {
  await apiClient.put(`/devices/${deviceId}/stream-request`, { requested });
};

export const getRelayStreamUrl = async (deviceId: string): Promise<string | null> => {
  try {
    const response = await apiClient.get(`/devices/${deviceId}/stream-url`);
    return response.data.streamUrl || null;
  } catch (error) {
    console.error('Error getting relay stream URL:', error);
    return null;
  }
};

export interface ServoState {
  pan: number | null;
  tilt: number | null;
  sequence: number;
  updatedAt: string | null;
}

const clampServoPayload = (value: number | undefined) => {
  if (typeof value !== 'number') return undefined;
  return Math.min(180, Math.max(0, value));
};

export const setServoPosition = async (
  deviceId: string,
  payload: { pan?: number; tilt?: number; persistOnly?: boolean }
): Promise<void> => {
  const body: Record<string, any> = {};
  const clampedPan = clampServoPayload(payload.pan);
  const clampedTilt = clampServoPayload(payload.tilt);

  if (typeof clampedPan === 'number') body.pan = clampedPan;
  if (typeof clampedTilt === 'number') body.tilt = clampedTilt;
  if (payload.persistOnly === true) body.persistOnly = 1;

  if (Object.keys(body).length === 0) return;

  await apiClient.put(`/devices/${deviceId}/servo`, body);
};

export const getServoState = async (deviceId: string): Promise<ServoState | null> => {
  try {
    const response = await apiClient.get(`/devices/${deviceId}/servo`);
    if (!response.data?.success || !response.data?.servo) return null;

    const servo = response.data.servo;
    return {
      pan: typeof servo.pan === 'number' ? servo.pan : null,
      tilt: typeof servo.tilt === 'number' ? servo.tilt : null,
      sequence: typeof servo.sequence === 'number' ? servo.sequence : 0,
      updatedAt: servo.updatedAt ?? null,
    };
  } catch (error) {
    console.error('Error fetching servo state:', error);
    return null;
  }
};

export const registerPushToken = async (token: string): Promise<void> => {
  try {
    await apiClient.post('/users/register-token', { token });
  } catch (error) {
    console.error('Error registering push token:', error);
  }
};
