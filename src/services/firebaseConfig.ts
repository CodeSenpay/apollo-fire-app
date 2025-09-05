import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import * as firebaseAuth from 'firebase/auth';
import {
  initializeAuth,
} from "firebase/auth";
import { get, getDatabase, off, onValue, ref, set, update } from "firebase/database";

const reactNativePersistence = (firebaseAuth as any).getReactNativePersistence;

// Your web app's Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: reactNativePersistence(ReactNativeAsyncStorage),
});
export const db = getDatabase(app);

// Type definition for your device data
export interface DeviceData {
  temperature: number;
  gasValue: number;
  isFlameDetected: number;
  isCriticalAlert: number;
  lastUpdate: number;
}

export function setStreamMode(
  deviceId: string,
  mode: 'local' | 'relay'
) {
  const streamModeRef = ref(db, `devices/${deviceId}/controls/streamMode`);
  return set(streamModeRef, mode);
}

export function subscribeToUserDevices(
  userId: string,
  callback: (deviceIds: string[]) => void
) {
  const devicesRef = ref(db, `users/${userId}/devices`);
  const listener = onValue(devicesRef, (snapshot) => {
    if (snapshot.exists()) {
      const deviceIds = Object.keys(snapshot.val());
      callback(deviceIds);
    } else {
      callback([]);
    }
  });

  // Return the unsubscribe function
  return () => off(devicesRef, 'value', listener);
}

// Gets the static details of a device, like its owner-assigned name
export async function getDeviceDetails(deviceId: string) {
  const detailRef = ref(db, `devices/${deviceId}/details`);
  const snapshot = await get(detailRef);
  return snapshot.exists() ? snapshot.val() : { name: `Device ${deviceId.slice(0, 6)}` };
}

// Function to subscribe to device updates
export function subscribeToDevice(
  deviceId: string,
  callback: (data: DeviceData | null) => void
) {
  const deviceRef = ref(db, `devices/${deviceId}/readings`);
  return onValue(deviceRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as DeviceData);
    } else {
      callback(null);
    }
  });
}

// new helper to request or cancel streaming
export function requestStream(deviceId: string, requested: boolean) {
  const ctrlPath = `devices/${deviceId}/controls/isStreamingRequested`;
  return set(ref(db, ctrlPath), requested);
}

/**
 * Claims a device for a specific user.
 * This function performs an atomic multi-path update to:
 * 1. Create a new record in the secure `/devices/{deviceId}` path, setting the owner.
 * 2. Delete the record from the public `/unclaimed_devices/{deviceId}` path.
 * @param {string} deviceId The unique ID of the device to claim.
 * @param {string} userId The UID of the user who is claiming the device.
 * @returns {Promise<void>} A promise that resolves on success or rejects on failure.
 */
export const claimDevice = async (deviceId: string, userId: string) => {
  if (!deviceId || !userId) {
    throw new Error("Device ID and User ID are required to claim a device.");
  }

  const updates: { [key: string]: any } = {};

  // This sets the owner on the device itself
  updates[`/devices/${deviceId}/ownerUID`] = userId;
  updates[`/devices/${deviceId}/controls/streamMode`] = "relay"; // default mode
  
  // *** THIS IS THE MISSING LINE ***
  // This adds a reference to the device under the user's data,
  // which is needed to show the list of their devices.
  updates[`/users/${userId}/devices/${deviceId}`] = true;

  // This deletes the public unclaimed record
  updates[`/unclaimed_devices/${deviceId}`] = null;

  try {
    await update(ref(db), updates);
    console.log("Device claimed successfully and linked to user!");
  } catch (error) {
    console.error("Failed to claim device:", error);
    throw error;
  }
};

