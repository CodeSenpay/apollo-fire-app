import { db, requestStream, setStreamMode, subscribeToDevice } from '@/src/services/firebaseConfig';
import Ionicons from '@expo/vector-icons/build/Ionicons';
import * as Network from 'expo-network';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { get, onValue, ref } from 'firebase/database';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

// --- Types ---
type Readings = {
  temperature: number | 'N/A';
  gasValue: number | 'N/A';
  isFlameDetected: boolean;
  isCriticalAlert: boolean;
  lastUpdate: number | 'N/A';
};

// --- Main Component ---
export default function DeviceDetailScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const mountedRef = useRef(true);

  // --- State ---
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'local' | 'relay'>('relay');
  const [readings, setReadings] = useState<Readings>({
    temperature: 'N/A',
    gasValue: 'N/A',
    isFlameDetected: false,
    isCriticalAlert: false,
    lastUpdate: 'N/A',
  });

  // --- Set navigation title ---
  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Device: ${deviceId?.slice(0, 12)}...`,
      headerRight: () => (
        <Link href={{ pathname: '/device/settings', params: { id: deviceId } }} asChild>
          <Pressable style={{ marginRight: 15 }}>
            <Ionicons name="settings-outline" size={24} color="#1F2937" />
          </Pressable>
        </Link>
      ),
    });
  }, [navigation, deviceId]);

  // --- Logic to get the stream URL ---
  const getStreamUrl = useCallback(
    async (mode: 'local' | 'relay') => {
      if (!deviceId) return;

      setIsLoading(true);
      setStreamError(null);
      setStreamUrl(null);

      try {
        let finalUrl = '';
        if (mode === 'relay') {
          const urlRef = ref(db, `devices/${deviceId}/streamBaseUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists() && snapshot.val()) {
            finalUrl = `${snapshot.val()}/stream/view/${deviceId}`;
          } else {
            throw new Error('Relay stream URL not configured.');
          }
        } else {
          const networkState = await Network.getNetworkStateAsync();
          if (networkState.type !== Network.NetworkStateType.WIFI) {
            throw new Error('Must be on Wi-Fi for local streaming.');
          }
          const urlRef = ref(db, `devices/${deviceId}/controls/streamUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists() && snapshot.val()) {
            finalUrl = snapshot.val();
          } else {
            throw new Error('Device has not published a local stream URL.');
          }
        }
        if (mountedRef.current) setStreamUrl(finalUrl);
      } catch (e: any) {
        if (mountedRef.current) {
          setStreamError(e.message);
          setIsLoading(false);
        }
      }
    },
    [deviceId]
  );

  // --- Subscribe to device data and controls ---
  useEffect(() => {
    if (!deviceId) return;
    mountedRef.current = true;
    requestStream(deviceId, true);

    const controlsRef = ref(db, `devices/${deviceId}/controls`);
    const unsubscribeControls = onValue(controlsRef, (snapshot) => {
      if (!mountedRef.current) return;
      const newMode = snapshot.val()?.streamMode || 'relay';
      setCurrentMode(newMode);
    });

    const unsubscribeReadings = subscribeToDevice(deviceId, (data) => {
        if (!mountedRef.current || !data) return;
        setReadings({
          temperature: typeof data.temperature === 'number' ? data.temperature : 'N/A',
          gasValue: typeof data.gasValue === 'number' ? data.gasValue : 'N/A',
          isFlameDetected: !!data.isFlameDetected,
          isCriticalAlert: !!data.isCriticalAlert,
          lastUpdate: typeof data.lastUpdate === 'number' ? data.lastUpdate : 'N/A',
        });
      });

    return () => {
      mountedRef.current = false;
      unsubscribeControls();
      unsubscribeReadings();
      if (deviceId) requestStream(deviceId, false);
    };
  }, [deviceId]);

  // --- Re-fetch URL when mode changes ---
  useEffect(() => {
    getStreamUrl(currentMode);
  }, [currentMode, getStreamUrl]);

  const handleModeSwitch = (mode: 'local' | 'relay') => {
    if (deviceId) setStreamMode(deviceId, mode);
  };
  
  // --- Render Functions ---
  const renderContent = () => {
    // State 1: An error has occurred.
    if (streamError) {
      return (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>STREAM OFFLINE</Text>
          <Text style={styles.errorText}>{streamError}</Text>
          <TouchableOpacity style={styles.startButton} onPress={() => getStreamUrl(currentMode)}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // State 2: We don't have a URL yet.
    if (!streamUrl) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Getting Stream URL...</Text>
        </View>
      );
    }

    // State 3: We have a URL, render the WebView and overlay the loader if needed.
    return (
      <>
        <WebView
  source={{
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body, html, img { margin: 0; padding: 0; width: 100%; height: 100%; object-fit: contain; background-color: black; }
          </style>
        </head>
        <body>
          <img src="${streamUrl}" />
        </body>
      </html>
    `,
    // --- THIS IS THE FIX ---
    baseUrl: '',
    // --- END FIX ---
  }}
  style={styles.webview}
  onLoad={() => setIsLoading(false)}
  onError={(event) => {
    setStreamError(`Failed to load stream: ${event.nativeEvent.description}`);
    setIsLoading(false);
  }}
/>
        {/* The loader is rendered ON TOP of the WebView */}
        {isLoading && (
          <View style={[StyleSheet.absoluteFill, styles.centered, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={[styles.loadingText, { color: '#ffffff' }]}>Connecting to Stream...</Text>
          </View>
        )}
      </>
    );
  };

  if (!deviceId) return <SafeAreaView style={styles.container}><Text>No Device ID.</Text></SafeAreaView>;
  
  const lastUpdateDate = readings.lastUpdate !== 'N/A' ? new Date(readings.lastUpdate).toLocaleString() : 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoWrap}>{renderContent()}</View>

      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={[styles.selectorButton, currentMode === 'local' && styles.selectorActive]}
          onPress={() => handleModeSwitch('local')}
        >
          <Text style={[styles.selectorText, currentMode === 'local' && styles.selectorTextActive]}>Local</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorButton, currentMode === 'relay' && styles.selectorActive]}
          onPress={() => handleModeSwitch('relay')}
        >
          <Text style={[styles.selectorText, currentMode === 'relay' && styles.selectorTextActive]}>Relay</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {/* Sensor readings... */}
        <View style={styles.row}>
          <Text style={styles.stat}>🌡️ Temperature:</Text>
          <Text style={[styles.value, (readings.temperature as number) > 45 && styles.alert]}>
            {readings.temperature}°C
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.stat}>💨 Gas Level:</Text>
          <Text style={[styles.value, (readings.gasValue as number) > 1000 && styles.alert]}>
            {readings.gasValue}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.stat}>🔥 Flame Detected:</Text>
          <Text style={[styles.value, readings.isFlameDetected && styles.alert]}>
            {readings.isFlameDetected ? 'YES' : 'No'}
          </Text>
        </View>
        <View style={[styles.row, styles.criticalRow]}>
          <Text style={styles.stat}>🚨 Critical Alert:</Text>
          <Text style={[styles.value, readings.isCriticalAlert && styles.alert]}>
            {readings.isCriticalAlert ? 'ACTIVE' : 'Inactive'}
          </Text>
        </View>
        <Text style={styles.lastUpdate}>Last update: {lastUpdateDate}</Text>
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---
const { width } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4));

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#F3F4F6' },
  videoWrap: {
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webview: { width: '100%', height: '100%', backgroundColor: '#000' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#9CA3AF' },
  offline: { flex: 1, width: '100%', backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 10 },
  offlineText: { color: '#F9FAFB', fontWeight: '700', fontSize: 18 },
  errorText: { marginTop: 8, color: '#F87171', textAlign: 'center', paddingHorizontal: 20 },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  criticalRow: { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4 },
  stat: { fontSize: 16, color: '#374151', fontWeight: '500' },
  value: { fontSize: 16, fontWeight: '700', color: '#111827' },
  alert: { color: '#DC2626' },
  lastUpdate: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  buttonText: { fontWeight: '700', color: '#FFFFFF' },
  startButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#4B5563',
    borderRadius: 8,
  },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 8, padding: 4 },
  selectorButton: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  selectorActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  selectorText: { fontSize: 16, fontWeight: '600', color: '#4B5563' },
  selectorTextActive: { color: '#1F2937' },
});