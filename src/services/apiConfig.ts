// API Configuration and Authentication Service
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
// Configure your API base URL here
const DEFAULT_API_BASE_URL = "http://192.168.1.104:3000/api";
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, "");

const buildApiUrl = (path: string) => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

// Storage keys
const TOKEN_KEY = '@auth_token';
const USER_KEY = '@user_data';

export interface User {
  id: string;
  email: string;
  name?: string;
  // Add other user properties as needed
}

export interface AuthResponse {

  success: boolean;
  userId: string; 
}

// Auth token management
export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const setAuthToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
};

export const removeAuthToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
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

// API request helper
const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<any> => {
  const token = await getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

// Authentication API calls
export const loginWithEmail = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  await setAuthToken(data.token);
  await setUserData(data.user);
  
  return data;
};

export const signUpWithEmail = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const data = await apiRequest('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  await setAuthToken(data.token);
  await setUserData(data.user);
  
  return data;
};

export const loginAsGuest = async (): Promise<AuthResponse> => {
  // Check if user already exists in local storage
  const existingUser = await getUserData();
  
  if (existingUser && existingUser.id) {
    console.log('Existing guest user found:', existingUser.id);
    return { success: true, userId: existingUser.id };
  }
  
  // Only register a new user if none exists

  const response = await axios.get(buildApiUrl('/users/register-user-id'));
  
  await setUserData({id:response.data.userId, email:"guest@gmail.com", name:"guest" });
  
  return response.data;
};

export const logout = async (): Promise<void> => {
  const existingUser = await getUserData();

  if (!existingUser?.id) {
    console.warn('Logout requested but no user ID found in storage.');
    await removeAuthToken();
    return;
  }

  try {
    const response = await axios.post(
      buildApiUrl('/users/logout-user'),
      { userId: existingUser.id },
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Logout failed');
    }

    console.log('Logout response:', response.data);
  } catch (error) {
    console.error('Logout API call failed:', error);
    throw error;
  } finally {
    await removeAuthToken();
  }
};

export const getCurrentUser = async (): Promise<User | null> => {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const user = await apiRequest('/auth/me');
    await setUserData(user);
    return user;
  } catch (error) {
    console.error('Error fetching current user:', error);
    await removeAuthToken();
    await removeUserData();
    return null;
  }
};

// Device API calls
export const getUserDevices = async (): Promise<string[]> => {
  try {
    const user = await getUserData();
    if (!user) {
      console.error('No user found');
      return [];
    }
    console.log("Fetching devices for user:", user.id);
    const response = await axios.get(buildApiUrl(`/users/${user.id}/devices`));
    
    console.log("API Response:", JSON.stringify(response.data, null, 2));
    
    if (response.data.success && response.data.devices) {
      const deviceIds = response.data.devices.map((device: any) => device.id);
      console.log("Device IDs:", deviceIds);
      return deviceIds;
    }
    
    console.log("No devices found or unsuccessful response");
    return [];
  } catch (error) {
    console.error('Error fetching user devices:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    return [];
  }
};

export interface NotificationHistoryEntry {
  id: number;
  deviceId: string | null;
  title: string | null;
  body: string | null;
  notificationType: string | null;
  sentAt: string;
}

export const getNotificationHistory = async (limit = 100): Promise<NotificationHistoryEntry[]> => {
  try {
    const user = await getUserData();
    if (!user) {
      console.error('No user found');
      return [];
    }

    const response = await axios.get(buildApiUrl(`/users/${user.id}/notifications`), {
      params: { limit }
    });

    if (response.data.success && Array.isArray(response.data.notifications)) {
      return response.data.notifications as NotificationHistoryEntry[];
    }

    return [];
  } catch (error) {
    console.error('Error fetching notification history:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    return [];
  }
};

export const getDeviceDetails = async (deviceId: string): Promise<any> => {
  return apiRequest(`/devices/${deviceId}/details`);
};

export const isDeviceAvailableForClaim = async (deviceId: string): Promise<boolean> => {
  try {
    const response = await axios.get(buildApiUrl(`/users/devices/${deviceId}/available`));
    return response.data.available === true;
  } catch (error) {
    console.error('Error checking device availability:', error);
    return false;
  }
};

export const claimDevice = async (deviceId: string, userId: string): Promise<void> => {
  await axios.post(buildApiUrl(`/users/devices/${deviceId}/claim`), {
    userId
  });
};

export const resetDevice = async (
  deviceId: string,
  userId: string
): Promise<void> => {
  await apiRequest(`/devices/${deviceId}/reset`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
};

export const setStreamMode = async (
  deviceId: string,
  mode: 'local' | 'relay'
): Promise<void> => {
  try {
    await axios.put(buildApiUrl(`/devices/${deviceId}/stream-mode`), {
      mode
    });
  } catch (error) {
    console.error('Error setting stream mode:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    throw error;
  }
};

export const requestStream = async (
  deviceId: string,
  requested: boolean
): Promise<void> => {
  try {
    await axios.put(buildApiUrl(`/devices/${deviceId}/stream-request`), {
      requested
    });
  } catch (error) {
    console.error('Error requesting stream:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    throw error;
  }
};

export const getRelayStreamUrl = async (deviceId: string): Promise<string | null> => {
  try {
    const response = await axios.get(buildApiUrl(`/devices/${deviceId}/stream-url`));
    return response.data.streamUrl || null;
  } catch (error) {
    console.error('Error getting relay stream URL:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    return null;
  }
};

export interface ServoState {
  pan: number | null;
  tilt: number | null;
  sequence: number;
  recenter: boolean;
  updatedAt: string | null;
}

const clampServoPayload = (value: number | undefined) => {
  if (typeof value !== 'number') {
    return undefined;
  }
  return Math.min(180, Math.max(0, value));
};

export const setServoPosition = async (
  deviceId: string,
  payload: { pan?: number; tilt?: number }
): Promise<void> => {
  const body: Record<string, number> = {};
  const clampedPan = clampServoPayload(payload.pan);
  const clampedTilt = clampServoPayload(payload.tilt);

  if (typeof clampedPan === 'number') {
    body.pan = clampedPan;
  }
  if (typeof clampedTilt === 'number') {
    body.tilt = clampedTilt;
  }

  if (Object.keys(body).length === 0) {
    return;
  }

  await axios.put(buildApiUrl(`/devices/${deviceId}/servo`), body);
};

export const recenterServo = async (deviceId: string): Promise<void> => {
  await axios.post(buildApiUrl(`/devices/${deviceId}/servo/recenter`));
};

export const getServoState = async (deviceId: string): Promise<ServoState | null> => {
  try {
    const response = await axios.get(buildApiUrl(`/devices/${deviceId}/servo`));
    if (!response.data?.success || !response.data?.servo) {
      return null;
    }

    const servo = response.data.servo;
    return {
      pan: typeof servo.pan === 'number' ? servo.pan : null,
      tilt: typeof servo.tilt === 'number' ? servo.tilt : null,
      sequence: typeof servo.sequence === 'number' ? servo.sequence : 0,
      recenter: Boolean(servo.recenter),
      updatedAt: servo.updatedAt ?? null,
    };
  } catch (error) {
    console.error('Error fetching servo state:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    return null;
  }
};

// Push notification token registration
export const registerPushToken = async (token: string, userId: string): Promise<void> => {
  console.log(JSON.stringify({ token, userId }))
  try {
    await fetch(buildApiUrl('/users/register-token'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, userId }),
    });
  } catch (error) {
    console.error('Error registering push token:', error);
  }
};
