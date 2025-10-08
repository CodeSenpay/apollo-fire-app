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

  success: boolean;
  userId: string; 
}

export interface DeviceData {
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
  // Check if user already exists in local storage
  const existingUser = await getUserData();
  
  if (existingUser && existingUser.id) {
    console.log('Existing guest user found:', existingUser.id);
    return { success: true, userId: existingUser.id };
  }
  
  // Only register a new user if none exists
  console.log('No existing user found, registering new guest user');
  const response = await axios.get('http://192.168.1.14:8000/api/users/register-user-id');
  
  await setUserData({id:response.data.userId, email:"guest@gmail.com", name:"guest" });
  
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
  try {
    const user = await getUserData();
    if (!user) {
      console.error('No user found');
      return [];
    }
    console.log("Fetching devices for user:", user.id);
    const response = await axios.get(`http://192.168.1.14:8000/api/users/${user.id}/devices`);
    
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

export const getDeviceDetails = async (deviceId: string): Promise<any> => {
  return apiRequest(`/devices/${deviceId}/details`);
};

export const getDeviceReadings = async (deviceId: string): Promise<DeviceData | null> => {
  try {
    const response = await axios.get(`http://192.168.1.14:8000/api/devices/${deviceId}/sensor-data`);
    return response.data;
  } catch (error) {
    console.error('Error fetching device readings:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
    }
    return null;
  }
};

export const isDeviceAvailableForClaim = async (deviceId: string): Promise<boolean> => {
  try {
    const response = await axios.get(`http://192.168.1.14:8000/api/users/devices/${deviceId}/available`);
    return response.data.available === true;
  } catch (error) {
    console.error('Error checking device availability:', error);
    return false;
  }
};

export const claimDevice = async (deviceId: string, userId: string): Promise<void> => {
  await axios.post(`http://192.168.1.14:8000/api/users/devices/${deviceId}/claim`, {
    userId
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
    const response = await axios.get(`http://192.168.1.14:8000/api/devices/${deviceId}/stream-url`);
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

// Push notification token registration
export const registerPushToken = async (token: string, userId: string): Promise<void> => {
  console.log(JSON.stringify({ token, userId }))
  try {
    await fetch('http://192.168.1.14:8000/api/users/register-token', {
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
