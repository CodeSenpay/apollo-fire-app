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

// Helper function to convert raw binary data to a base64 string
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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
// Replace the existing DeviceDetailScreen component with this version
export default function DeviceDetailScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const ws = useRef<WebSocket | null>(null);
  const loadTarget = useRef<'A' | 'B'>('B');

  // double buffer state for rendering
  const [frameA, setFrameA] = useState<string | null>(null);
  const [frameB, setFrameB] = useState<string | null>(null);
  const [activeFrame, setActiveFrame] = useState<'A' | 'B'>('A');

  // other state
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'local' | 'relay'>('relay');
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

  const getStreamUrl = useCallback(async (mode: 'local' | 'relay') => {
    if (!deviceId) return;
    setIsLoading(true);
    setStreamError(null);
    setStreamUrl(null);
    try {
      if (mode === 'relay') throw new Error('Relay streaming is not supported.');
      const networkState = await Network.getNetworkStateAsync();
      if (networkState.type !== Network.NetworkStateType.WIFI) throw new Error('Must be on Wi-Fi for local streaming.');
      const urlRef = ref(db, `devices/${deviceId}/controls/streamUrl`);
      const snapshot = await get(urlRef);
      if (snapshot.exists() && snapshot.val()) setStreamUrl(snapshot.val());
      else throw new Error('Device has not published a local stream URL.');
    } catch (e: any) {
      setStreamError(e.message);
      setIsLoading(false);
    }
  }, [deviceId]);

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

  // --- New: frame timing and buffer refs ---
  const FRAME_RATE = 15;
  const FRAME_INTERVAL = Math.round(1000 / FRAME_RATE); // ~66 ms

  const bufferARef = useRef<string | null>(null);
  const bufferBRef = useRef<string | null>(null);
  const loadedARef = useRef(false);
  const loadedBRef = useRef(false);
  const lastSwapRef = useRef<number>(0);
  const scheduledSwapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // helper that will attempt a swap only if the buffer is loaded and the interval passed
  function scheduleSwapIfReady(buffer: 'A' | 'B') {
    const loaded = buffer === 'A' ? loadedARef.current : loadedBRef.current;
    if (!loaded) return;

    const now = Date.now();
    const since = now - (lastSwapRef.current || 0);

    // if enough time passed do immediate swap
    if (since >= FRAME_INTERVAL) {
      lastSwapRef.current = now;
      setActiveFrame(buffer);
      // flip loadTarget for next incoming frame
      loadTarget.current = buffer === 'A' ? 'B' : 'A';
      if (scheduledSwapRef.current) {
        clearTimeout(scheduledSwapRef.current);
        scheduledSwapRef.current = null;
      }
      return;
    }

    // schedule a delayed swap to hit target frame interval
    const delay = FRAME_INTERVAL - since;
    if (scheduledSwapRef.current) {
      clearTimeout(scheduledSwapRef.current);
    }
    scheduledSwapRef.current = setTimeout(() => {
      // only perform swap if buffer still loaded and has not been overwritten
      const stillLoaded = buffer === 'A' ? loadedARef.current : loadedBRef.current;
      if (!stillLoaded) {
        scheduledSwapRef.current = null;
        return;
      }
      lastSwapRef.current = Date.now();
      setActiveFrame(buffer);
      loadTarget.current = buffer === 'A' ? 'B' : 'A';
      scheduledSwapRef.current = null;
    }, delay);
  }

  useEffect(() => {
    if (currentMode !== 'local' || !streamUrl) {
      ws.current?.close();
      return;
    }
    const wsUrl = streamUrl.startsWith('ws://') ? streamUrl : streamUrl.replace('http://', 'ws://').replace('/stream', '/ws');
    ws.current = new WebSocket(wsUrl);
    ws.current.binaryType = 'arraybuffer';

    ws.current.onopen = () => {
      setIsLoading(false);
      // reset buffers on fresh open
      bufferARef.current = null;
      bufferBRef.current = null;
      loadedARef.current = false;
      loadedBRef.current = false;
      setFrameA(null);
      setFrameB(null);
      lastSwapRef.current = 0;
      if (scheduledSwapRef.current) {
        clearTimeout(scheduledSwapRef.current);
        scheduledSwapRef.current = null;
      }
    };

    ws.current.onerror = () => setStreamError('WebSocket error. Check connection.');
    ws.current.onclose = () => {
      setFrameA(null);
      setFrameB(null);
      bufferARef.current = null;
      bufferBRef.current = null;
      loadedARef.current = false;
      loadedBRef.current = false;
    };

    ws.current.onmessage = (event) => {
      // convert binary to data uri
      const base64Data = arrayBufferToBase64(event.data as ArrayBuffer);
      const dataUri = `data:image/jpeg;base64,${base64Data}`;

      // write to inactive buffer and mark it as not loaded yet
      if (loadTarget.current === 'A') {
        bufferARef.current = dataUri;
        loadedARef.current = false;
        setFrameA(dataUri);
      } else {
        bufferBRef.current = dataUri;
        loadedBRef.current = false;
        setFrameB(dataUri);
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [streamUrl, currentMode]);

  const handleModeSwitch = (mode: 'local' | 'relay') => {
    if (deviceId) setStreamMode(deviceId, mode);
  };

  const renderContent = () => {
    if (currentMode !== 'local') return <View style={styles.offline}><Text style={styles.offlineText}>MODE: RELAY</Text></View>;
    if (isLoading) return <View style={styles.centered}><ActivityIndicator size="large" /><Text style={styles.loadingText}>Connecting...</Text></View>;
    if (streamError) return <View style={styles.offline}><Text style={styles.offlineText}>STREAM OFFLINE</Text><Text style={styles.errorText}>{streamError}</Text></View>;

    return (
      <>
        <Image
          source={frameA ? { uri: frameA } : undefined}
          style={[StyleSheet.absoluteFill, { opacity: activeFrame === 'A' ? 1 : 0 }]}
          fadeDuration={0} // remove built in fade to avoid visual flicker
          onLoadEnd={() => {
            // mark buffer A loaded
            loadedARef.current = true;
            // only schedule swap for A if this buffer is most recent
            if (bufferARef.current && bufferARef.current === frameA) {
              scheduleSwapIfReady('A');
            }
          }}
          resizeMode="cover"
        />
        <Image
          source={frameB ? { uri: frameB } : undefined}
          style={[StyleSheet.absoluteFill, { opacity: activeFrame === 'B' ? 1 : 0 }]}
          fadeDuration={0}
          onLoadEnd={() => {
            loadedBRef.current = true;
            if (bufferBRef.current && bufferBRef.current === frameB) {
              scheduleSwapIfReady('B');
            }
          }}
          resizeMode="cover"
        />
      </>
    );
  };

  if (!deviceId) return <SafeAreaView style={styles.container}><Text>No Device ID.</Text></SafeAreaView>;
  const lastUpdateDate = readings.lastUpdate !== 'N/A' ? new Date(readings.lastUpdate).toLocaleString() : 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoWrap}>{renderContent()}</View>
      <View style={styles.selectorContainer}>
        <TouchableOpacity style={[styles.selectorButton, currentMode === 'local' && styles.selectorActive]} onPress={() => handleModeSwitch('local')}><Text style={[styles.selectorText, currentMode === 'local' && styles.selectorTextActive]}>Local</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.selectorButton, currentMode === 'relay' && styles.selectorActive]} onPress={() => handleModeSwitch('relay')}><Text style={[styles.selectorText, currentMode === 'relay' && styles.selectorTextActive]}>Relay</Text></TouchableOpacity>
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
  container: { flex: 1, padding: 16, backgroundColor: '#F3F4F6' },
  videoWrap: { height: VIDEO_HEIGHT, backgroundColor: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%'},
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