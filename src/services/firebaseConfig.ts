// src/services/firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBKFcyt_e5k9WJANZYipx8nzUVT7AFxd_Y",
  authDomain: "apollo-fire-87ca5.firebaseapp.com",
  databaseURL: "https://apollo-fire-87ca5-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "apollo-fire-87ca5",
  storageBucket: "apollo-fire-87ca5.firebasestorage.app",
  messagingSenderId: "952508768282",
  appId: "1:952508768282:web:408d01c7cc0b722dbc71a3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
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
  const ctrlPath = `devices/${deviceId}/controls/isStreamingRequested`
  return set(ref(db, ctrlPath), requested)
}
