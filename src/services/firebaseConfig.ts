import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, set, update } from "firebase/database";

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
export const auth = getAuth(app);
export const db = getDatabase(app);

// Type definition for your device data
export interface DeviceData {
  temperature: number;
  gasValue: number;
  isFlameDetected: number;
  isCriticalAlert: number;
  lastUpdate: number;
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

  console.log(`Attempting to claim device ${deviceId} for user ${userId}...`);

  const updates: { [key: string]: any } = {};

  // Path to the new, secure device record. We set the owner and some initial defaults.
  updates[`/devices/${deviceId}/ownerUID`] = userId;
  updates[`/devices/${deviceId}/controls/streamMode`] = "relay";
  updates[`/devices/${deviceId}/controls/isStreamingRequested`] = false;

  // Path to the public unclaimed record. Setting it to null deletes it.
  updates[`/unclaimed_devices/${deviceId}`] = null;

  try {
    // This update runs as a single, atomic transaction.
    await update(ref(db), updates);
    console.log("Device claimed successfully!");
  } catch (error) {
    console.error("Failed to claim device:", error);
    throw error;
  }
};

