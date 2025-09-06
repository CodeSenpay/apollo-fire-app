import { db, requestStream, setStreamMode, subscribeToDevice } from '@/src/services/firebaseConfig';
import Ionicons from '@expo/vector-icons/build/Ionicons';
import * as Network from 'expo-network';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { get, onValue, ref } from 'firebase/database';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// replace your arrayBufferToBase64 with this implementation
function base64ArrayBuffer(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const len = bytes.length;
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  let i;

  for (i = 0; i < len - 2; i += 3) {
    base64 += lookup[bytes[i] >> 2];
    base64 += lookup[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += lookup[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += lookup[bytes[i + 2] & 63];
  }

  if (i < len) {
    base64 += lookup[bytes[i] >> 2];
    if (i === len - 1) {
      base64 += lookup[(bytes[i] & 3) << 4];
      base64 += '==';
    } else {
      base64 += lookup[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += lookup[(bytes[i + 1] & 15) << 2];
      base64 += '=';
    }
  }

  return base64;
}


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
  const ws = useRef<WebSocket | null>(null);

  // Ref to hold the latest frame without causing re-renders on every message
  const latestFrame = useRef<string | null>(null);

  // State
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'local' | 'relay'>('relay');
  const [frameSource, setFrameSource] = useState<string | null>(null);
  const [readings, setReadings] = useState<Readings>({
    temperature: 'N/A', gasValue: 'N/A', isFlameDetected: false, isCriticalAlert: false, lastUpdate: 'N/A',
  });

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

  const getStreamUrl = useCallback(
    async (mode: 'local' | 'relay') => {
      if (!deviceId) return;
      setIsLoading(true);
      setStreamError(null);
      setStreamUrl(null);

      try {
        if (mode === 'relay') throw new Error('Relay streaming is not supported.');

        const networkState = await Network.getNetworkStateAsync();
        if (networkState.type !== Network.NetworkStateType.WIFI) {
          throw new Error('Must be on Wi-Fi for local streaming.');
        }

        const urlRef = ref(db, `devices/${deviceId}/controls/streamUrl`);
        const snapshot = await get(urlRef);
        if (snapshot.exists() && snapshot.val()) {
          setStreamUrl(snapshot.val());
        } else {
          throw new Error('Device has not published a local stream URL.');
        }
      } catch (e: any) {
        setStreamError(e.message);
        setIsLoading(false);
      }
    },
    [deviceId]
  );

  useEffect(() => {
    if (!deviceId) return;
    requestStream(deviceId, true);
    const controlsRef = ref(db, `devices/${deviceId}/controls`);
    const unsubscribeControls = onValue(controlsRef, (snapshot) => {
      const newMode = snapshot.val()?.streamMode || 'relay';
      if (newMode !== currentMode) setCurrentMode(newMode);
    });
    const unsubscribeReadings = subscribeToDevice(deviceId, (data) => {
      if (!data) return;
      setReadings({
        temperature: typeof data.temperature === 'number' ? data.temperature : 'N/A',
        gasValue: typeof data.gasValue === 'number' ? data.gasValue : 'N/A',
        isFlameDetected: !!data.isFlameDetected,
        isCriticalAlert: !!data.isCriticalAlert,
        lastUpdate: typeof data.lastUpdate === 'number' ? data.lastUpdate : 'N/A',
      });
    });
    return () => {
      unsubscribeControls();
      unsubscribeReadings();
      if (deviceId) requestStream(deviceId, false);
    };
  }, [deviceId]);

  useEffect(() => {
    getStreamUrl(currentMode);
  }, [currentMode, getStreamUrl]);

  // WebSocket Connection Handler
  useEffect(() => {
    if (currentMode !== 'local' || !streamUrl) {
      ws.current?.close();
      return;
    }

    const wsUrl = streamUrl.startsWith('ws://') ? streamUrl : streamUrl.replace('http://', 'ws://').replace('/stream', '/ws');

    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => setIsLoading(false);
    ws.current.onerror = (error) => setStreamError('WebSocket error. Check connection.');
    ws.current.onclose = () => setFrameSource(null);

    ws.current.onmessage = (event) => {
      try {
        // if message already a data URI or base64 string
        if (typeof event.data === 'string') {
          const payload = event.data;
          // if server sends full data URI
          if (payload.startsWith('data:image')) {
            latestFrame.current = payload;
          } else {
            // assume payload is base64
            latestFrame.current = `data:image/jpeg;base64,${payload}`;
          }
          setIsLoading(false);
          return;
        }
    
        // ArrayBuffer case
        if (event.data instanceof ArrayBuffer) {
          const b64 = base64ArrayBuffer(event.data);
          latestFrame.current = `data:image/jpeg;base64,${b64}`;
          setIsLoading(false);
          return;
        }
    
        // Blob case (read it)
        // FileReader is supported in Expo/React Native environments
        if (event.data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const ab = reader.result as ArrayBuffer;
            const b64 = base64ArrayBuffer(ab);
            latestFrame.current = `data:image/jpeg;base64,${b64}`;
            setIsLoading(false);
          };
          reader.readAsArrayBuffer(event.data);
          return;
        }
    
      } catch (err) {
        console.warn('Frame decode error', err);
        setStreamError('Frame decode error');
      }
    };
    

    return () => ws.current?.close();
  }, [streamUrl, currentMode]);

  // Optimized Render Loop
  useEffect(() => {
    let frameId: number;
    const renderLoop = () => {
      if (latestFrame.current) {
        setFrameSource(latestFrame.current);
        latestFrame.current = null; // Mark the frame as rendered
      }
      frameId = requestAnimationFrame(renderLoop);
    };

    frameId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(frameId);
  }, []);


  const handleModeSwitch = (mode: 'local' | 'relay') => {
    if (deviceId) setStreamMode(deviceId, mode);
  };

  const renderContent = () => {
    if (currentMode !== 'local') {
      return <View style={styles.offline}><Text style={styles.offlineText}>MODE: RELAY</Text></View>;
    }
    if (frameSource) {
      return <Image source={{ uri: frameSource }} style={styles.videoImage} resizeMode="contain" />;
    }    
    if (isLoading) {
      return <View style={styles.centered}><ActivityIndicator size="large" /><Text style={styles.loadingText}>Connecting...</Text></View>;
    }
    if (streamError) {
      return <View style={styles.offline}><Text style={styles.offlineText}>STREAM OFFLINE</Text><Text style={styles.errorText}>{streamError}</Text></View>;
    }
    return <View style={styles.centered}><Text style={styles.loadingText}>Preparing local stream...</Text></View>;
  };

  if (!deviceId) return <SafeAreaView style={styles.container}><Text>No Device ID.</Text></SafeAreaView>;
  const lastUpdateDate = readings.lastUpdate !== 'N/A' ? new Date(readings.lastUpdate).toLocaleString() : 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoWrap}>{renderContent()}</View>
      <View style={styles.selectorContainer}>
        <TouchableOpacity style={[styles.selectorButton, currentMode === 'local' && styles.selectorActive]} onPress={() => handleModeSwitch('local')}>
          <Text style={[styles.selectorText, currentMode === 'local' && styles.selectorTextActive]}>Local</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.selectorButton, currentMode === 'relay' && styles.selectorActive]} onPress={() => handleModeSwitch('relay')}>
          <Text style={[styles.selectorText, currentMode === 'relay' && styles.selectorTextActive]}>Relay</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <View style={styles.row}><Text style={styles.stat}>🌡️ Temperature:</Text><Text style={[styles.value, typeof readings.temperature === 'number' && readings.temperature > 45 && styles.alert]}>{readings.temperature}°C</Text></View>
        <View style={styles.row}><Text style={styles.stat}>💨 Gas Level:</Text><Text style={[styles.value, typeof readings.gasValue === 'number' && readings.gasValue > 1000 && styles.alert]}>{readings.gasValue}</Text></View>
        <View style={styles.row}><Text style={styles.stat}>🔥 Flame Detected:</Text><Text style={[styles.value, readings.isFlameDetected && styles.alert]}>{readings.isFlameDetected ? 'YES' : 'No'}</Text></View>
        <View style={[styles.row, styles.criticalRow]}><Text style={styles.stat}>🚨 Critical Alert:</Text><Text style={[styles.value, readings.isCriticalAlert && styles.alert]}>{readings.isCriticalAlert ? 'ACTIVE' : 'Inactive'}</Text></View>
        <Text style={styles.lastUpdate}>Last update: {lastUpdateDate}</Text>
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---
const { width } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4));

const styles = StyleSheet.create({
  // add to your StyleSheet
videoImage: {
  width: '100%',
  height: '100%'
},
  container: { flex: 1, padding: 16, backgroundColor: '#F3F4F6' },
  videoWrap: { height: VIDEO_HEIGHT, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 16, justifyContent: 'center', alignItems: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#9CA3AF' },
  offline: { flex: 1, width: '100%', backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center', padding: 20 },
  offlineText: { color: '#F9FAFB', fontWeight: '700', fontSize: 18, textAlign: 'center' },
  errorText: { marginTop: 8, color: '#F3F4F6', textAlign: 'center' },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, marginTop: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  criticalRow: { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4 },
  stat: { fontSize: 16, color: '#374151', fontWeight: '500' },
  value: { fontSize: 16, fontWeight: '700', color: '#111827' },
  alert: { color: '#DC2626' },
  lastUpdate: { marginTop: 8, textAlign: 'center', color: '#6B7280', fontSize: 13, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8 },
  selectorContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 8, padding: 4 },
  selectorButton: { flex: 1, paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  selectorActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  selectorText: { fontSize: 16, fontWeight: '600', color: '#4B5563' },
  selectorTextActive: { color: '#1F2937' },
});