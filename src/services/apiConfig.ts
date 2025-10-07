// API Configuration and Authentication Service
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
// Configure your API base URL here
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3000/api";

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
  token: string;
  user: User;
}

export interface DeviceData {
  temperature: number;
  gasValue: number;
  isFlameDetected: number;
  isCriticalAlert: number;
  lastUpdate: number;
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
  console.log("Praise");
  const response = await axios.get('http://localhost:3000/api/auth/guest-login', {headers: {"Content-Type": 'application/json'}});
  console.log("Check Mic");
  // await setAuthToken(response.data.token);
  // await setUserData(response.data.user);
  
  return response.data;
};

export const logout = async (): Promise<void> => {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
  } catch (error) {
    console.error('Logout API call failed:', error);
  } finally {
    await removeAuthToken();
    await removeUserData();
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
  const data = await apiRequest('/devices');
  return data.devices || [];
};

export const getDeviceDetails = async (deviceId: string): Promise<any> => {
  return apiRequest(`/devices/${deviceId}/details`);
};

export const getDeviceReadings = async (deviceId: string): Promise<DeviceData | null> => {
  try {
    return await apiRequest(`/devices/${deviceId}/readings`);
  } catch (error) {
    console.error('Error fetching device readings:', error);
    return null;
  }
};

export const isDeviceAvailableForClaim = async (deviceId: string): Promise<boolean> => {
  try {
    const data = await apiRequest(`/devices/${deviceId}/available`);
    return data.available === true;
  } catch (error) {
    console.error('Error checking device availability:', error);
    return false;
  }
};

export const claimDevice = async (deviceId: string, userId: string): Promise<void> => {
  await apiRequest(`/devices/${deviceId}/claim`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
};

export const updateDeviceThresholds = async (
  deviceId: string,
  thresholds: { temperature: number; gas: number }
): Promise<void> => {
  await apiRequest(`/devices/${deviceId}/thresholds`, {
    method: 'PUT',
    body: JSON.stringify(thresholds),
  });
};

export const getDeviceThresholds = async (
  deviceId: string
): Promise<{ temperature: number; gas: number }> => {
  return apiRequest(`/devices/${deviceId}/thresholds`);
};

export const setStreamMode = async (
  deviceId: string,
  mode: 'local' | 'relay'
): Promise<void> => {
  await apiRequest(`/devices/${deviceId}/stream-mode`, {
    method: 'PUT',
    body: JSON.stringify({ mode }),
  });
};

export const requestStream = async (
  deviceId: string,
  requested: boolean
): Promise<void> => {
  await apiRequest(`/devices/${deviceId}/stream-request`, {
    method: 'PUT',
    body: JSON.stringify({ requested }),
  });
};

export const getRelayStreamUrl = async (deviceId: string): Promise<string | null> => {
  try {
    const data = await apiRequest(`/devices/${deviceId}/relay-stream`);
    return data.streamUrl || null;
  } catch (error) {
    console.error('Error getting relay stream URL:', error);
    return null;
  }
};

// Push notification token registration
export const registerPushToken = async (token: string): Promise<void> => {
  try {
    await apiRequest('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  } catch (error) {
    console.error('Error registering push token:', error);
  }
};
