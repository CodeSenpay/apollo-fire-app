import { db, requestStream, setStreamMode, subscribeToDevice } from '@/src/services/firebaseConfig';
import Ionicons from '@expo/vector-icons/build/Ionicons';
import * as Network from 'expo-network';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import { get, onValue, ref } from 'firebase/database';
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
type StreamStatus = 'connecting' | 'online' | 'offline' | 'error';

// --- Main Component ---
export default function DeviceDetailScreen() {
  // --- State ---
  const [isWifiConnected, setIsWifiConnected] = useState(true);
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'local' | 'relay'>('relay');
  const [readings, setReadings] = useState<Readings>({
    temperature: 'N/A',
    gasValue: 'N/A',
    isFlameDetected: false,
    isCriticalAlert: false,
    lastUpdate: 'N/A',
  });

  const mountedRef = useRef(true);

  // --- Set navigation title ---
  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Device: ${deviceId?.slice(0, 12)}...`, headerRight: () => (
        <Link href={{ pathname: "/device/settings", params: { id: deviceId } }} asChild>
          <Pressable style={{ marginRight: 15 }}>
            <Ionicons name="settings-outline" size={24} color="#1F2937" />
          </Pressable>
        </Link>
      ),
    });
  }, [navigation, deviceId]);

  // --- Check Wi-Fi connection ---
  const checkNetwork = async () => {
    const networkState = await Network.getNetworkStateAsync();
    if (mountedRef.current) {
      setIsWifiConnected(networkState.type === Network.NetworkStateType.WIFI);
    }
  };
  checkNetwork();

  // --- Try to connect to stream (fetch URL and check status) ---
  const tryConnectStream = useCallback(
    async (modeOverride?: 'local' | 'relay') => {
      if (!deviceId) return;
      setStreamStatus('connecting');
      setLastError(null);
      setStreamUrl(null);

      let mode = currentMode;
      if (modeOverride) mode = modeOverride;

      try {
        let finalUrl = '';
        if (mode === 'relay') {
          // Get relay stream URL from database
          const urlRef = ref(db, `devices/${deviceId}/streamBaseUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists()) {
            finalUrl = `${snapshot.val()}/stream/view/${deviceId}`;
          } else {
            throw new Error('Relay stream URL not configured.');
          }
        } else {
          // Get local stream URL from database
          const urlRef = ref(db, `devices/${deviceId}/controls/streamUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists() && snapshot.val()) {
            finalUrl = snapshot.val();
          } else {
            setStreamStatus('offline');
            setLastError('Device has not published a local stream URL.');
            return;
          }
        }

        if (mountedRef.current) {
          setStreamUrl(finalUrl);
          setStreamStatus('connecting');
          setLastError(null);

          // Check if stream is online
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(finalUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
              setStreamStatus('online');
            } else {
              setStreamStatus('offline');
              setLastError(`Stream is offline (status: ${res.status})`);
            }
          } catch (error) {
            if (!mountedRef.current) return;
            setStreamStatus('error');
            setLastError('Failed to connect to the stream.');
          }
        }
      } catch (e: any) {
        if (mountedRef.current) {
          setStreamUrl(null);
          setLastError(e.message);
          setStreamStatus('error');
        }
      }
    },
    [deviceId, currentMode]
  );

  // --- Subscribe to controls and readings on mount, and connect to stream ---
  useEffect(() => {
    if (!deviceId) return;
    mountedRef.current = true;

    // Subscribe to controls (sync currentMode)
    const controlsRef = ref(db, `devices/${deviceId}/controls`);
    const unsubscribeControls = onValue(controlsRef, (snapshot) => {
      const controls = snapshot.val();
      if (mountedRef.current && controls) {
        setCurrentMode(controls.streamMode || 'relay');
      }
    });

    // Subscribe to sensor readings
    const unsubscribeReadings = subscribeToDevice(deviceId, (data) => {
      if (!mountedRef.current || !data) return;
      setReadings({
        temperature: typeof data.temperature === 'number' ? data.temperature : 'N/A',
        gasValue: typeof data.gasValue === 'number' ? data.gasValue : 'N/A',
        isFlameDetected: data.isFlameDetected === 1,
        isCriticalAlert: data.isCriticalAlert === 1,
        lastUpdate: typeof data.lastUpdate === 'number' ? data.lastUpdate : 'N/A',
      });
    });

    // Request stream and connect on mount
    requestStream(deviceId, true);
    tryConnectStream();

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      unsubscribeControls();
      unsubscribeReadings();
      if (deviceId) {
        requestStream(deviceId, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  // --- Reconnect to stream when mode changes ---
  useEffect(() => {
    if (!deviceId) return;
    tryConnectStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, deviceId]);

  // --- Retry stream connection handler ---
  const handleRetry = () => {
    if (!deviceId) return;
    requestStream(deviceId, true);
    tryConnectStream();
  };

  // --- Mode switch handler ---
  const handleModeSwitch = (mode: 'local' | 'relay') => {
    if (!deviceId) return;
    setStreamMode(deviceId, mode);
    setCurrentMode(mode);
    // tryConnectStream will be triggered by useEffect on currentMode change
  };

  // --- Render video/stream content ---
  const renderContent = () => {
    // Show Wi-Fi required message for local mode
    if (currentMode === 'local' && !isWifiConnected) {
      return (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>WI-FI REQUIRED</Text>
          <Text style={styles.errorText}>
            Please connect to the same Wi-Fi network as your device for local streaming.
          </Text>
        </View>
      );
    }
    // Show loading indicator while connecting
    if (streamStatus === 'connecting') {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Connecting to Stream...</Text>
        </View>
      );
    }
    // Show stream if online
    if (streamStatus === 'online' && streamUrl) {
      return <WebView source={{ uri: streamUrl }} style={styles.webview} />;
    }
    // Show retry button and error if offline/error
    return (
      <View style={styles.offline}>
        <Text style={styles.offlineText}>STREAM OFFLINE</Text>
        {lastError && <Text style={styles.errorText}>{lastError}</Text>}

        {/* --- THIS IS THE FIX --- */}
        {/* Display the URL for easier debugging */}
        {currentMode === 'local' && streamUrl && (
          <Text style={styles.debugText}>Trying to connect to: {streamUrl}</Text>
        )}
        {/* --- END FIX --- */}

        <TouchableOpacity style={styles.startButton} onPress={handleRetry}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // --- Show message if no deviceId provided ---
  if (!deviceId) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>No Device ID provided.</Text>
      </SafeAreaView>
    );
  }

  // --- Format last update date ---
  const lastUpdateDate =
    readings.lastUpdate !== 'N/A'
      ? new Date(readings.lastUpdate).toLocaleString()
      : 'N/A';

  // --- Main render ---
  return (
    <SafeAreaView style={styles.container}>
      {/* Video/Stream Section */}
      <View style={styles.videoWrap}>{renderContent()}</View>

      {/* Mode Selector */}
      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={[
            styles.selectorButton,
            currentMode === 'local' && styles.selectorActive,
          ]}
          onPress={() => handleModeSwitch('local')}
        >
          <Text
            style={[
              styles.selectorText,
              currentMode === 'local' && styles.selectorTextActive,
            ]}
          >
            Local
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.selectorButton,
            currentMode === 'relay' && styles.selectorActive,
          ]}
          onPress={() => handleModeSwitch('relay')}
        >
          <Text
            style={[
              styles.selectorText,
              currentMode === 'relay' && styles.selectorTextActive,
            ]}
          >
            Relay
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sensor Readings Card */}
      <View style={styles.card}>
        {/* Temperature */}
        <View style={styles.row}>
          <Text style={styles.stat}>🌡️ Temperature:</Text>
          <Text
            style={[
              styles.value,
              readings.temperature as number > 45 && styles.alert,
            ]}
          >
            {readings.temperature}°C
          </Text>
        </View>
        {/* Gas Level */}
        <View style={styles.row}>
          <Text style={styles.stat}>💨 Gas Level:</Text>
          <Text
            style={[
              styles.value,
              readings.gasValue as number > 1000 && styles.alert,
            ]}
          >
            {readings.gasValue}
          </Text>
        </View>
        {/* Flame Detection */}
        <View style={styles.row}>
          <Text style={styles.stat}>🔥 Flame Detected:</Text>
          <Text style={[styles.value, readings.isFlameDetected && styles.alert]}>
            {readings.isFlameDetected ? 'YES' : 'No'}
          </Text>
        </View>
        {/* Critical Alert */}
        <View
          style={[
            styles.row,
            {
              borderTopWidth: 1,
              borderTopColor: '#E5E7EB',
              paddingTop: 8,
              marginTop: 4,
            },
          ]}
        >
          <Text style={styles.stat}>🚨 Critical Alert:</Text>
          <Text style={[styles.value, readings.isCriticalAlert && styles.alert]}>
            {readings.isCriticalAlert ? 'ACTIVE' : 'Inactive'}
          </Text>
        </View>
        {/* Last Update */}
        <Text style={styles.lastUpdate}>Last update: {lastUpdateDate}</Text>
      </View>
    </SafeAreaView>
  );
}

// --- Layout constants ---
const { width } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4));

// --- Styles ---
const styles = StyleSheet.create({
  debugText: {
    marginTop: 15,
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  videoWrap: {
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#9CA3AF',
  },
  offline: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineText: {
    color: '#F9FAFB',
    fontWeight: '700',
    fontSize: 18,
  },
  errorText: {
    marginTop: 8,
    color: '#F87171',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stat: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  alert: {
    color: '#DC2626',
  },
  lastUpdate: {
    marginTop: 8,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  },
  buttonText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  startButton: {
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#4B5563',
    borderRadius: 8,
  },
  selectorContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    padding: 4,
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  selectorActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  selectorTextActive: {
    color: '#1F2937',
  },
});