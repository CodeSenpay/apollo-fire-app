import React, { JSX, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { requestStream, subscribeToDevice } from '../src/services/firebaseConfig'; // adjust path if needed

type Readings = {
  temperature: number | 'N/A'
  gasValue: number | 'N/A'
  isFlameDetected: boolean | 'N/A'
  isCriticalAlert: boolean | 'N/A'
  lastUpdate: number | 'N/A'
}

const RELAY_BASE = 'https://apollo-relay-server.onrender.com' // set your Render URL
const DEVICE_ID = 'apollo_device_01' // set your device id
const POLL_INTERVAL = 3000
const FETCH_TIMEOUT = 5000

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000

type StreamStatus = 'connecting' | 'online' | 'offline' | 'error';

export default function CameraScreen(): JSX.Element {
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [readings, setReadings] = useState<Readings>({
    temperature: 'N/A',
    gasValue: 'N/A',
    isFlameDetected: 'N/A',
    isCriticalAlert: 'N/A',
    lastUpdate: 'N/A',
  });
  const [attemptCount, setAttemptCount] = useState(0)
  const [waitingManual, setWaitingManual] = useState(false)

  const mountedRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firebaseUnsubRef = useRef<() => void | null>(null)

  useEffect(() => {
    mountedRef.current = true;

    // Subscribe to Firebase for sensor readings
    const firebaseUnsub = subscribeToDevice(DEVICE_ID, (data) => {
      if (!mountedRef.current || !data) return;
      setReadings({
        temperature: typeof data.temperature === 'number' ? data.temperature : 'N/A',
        gasValue: typeof data.gasValue === 'number' ? data.gasValue : 'N/A',
        isFlameDetected: data.isFlameDetected === 1,
        isCriticalAlert: data.isCriticalAlert === 1,
        lastUpdate: typeof data.lastUpdate === 'number' ? data.lastUpdate : 'N/A',
      });
    });
    firebaseUnsubRef.current = firebaseUnsub;

    // Perform the initial check of the stream status
    checkStreamStatus();

    // Cleanup function
    return () => {
      mountedRef.current = false;
      if (firebaseUnsubRef.current) {
        firebaseUnsubRef.current();
      }
    };
  }, []);

  const checkStreamStatus = async () => {
    if (!mountedRef.current) return;
    setStreamStatus('connecting');
    setLastError(null);

    try {
      // Use a timeout controller for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const res = await fetch(`${RELAY_BASE}/stream/view/${DEVICE_ID}`, { signal: controller.signal });
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
      setLastError('Failed to connect to the relay server.');
    }
  };

  const handleStartStream = async () => {
    try {
      await requestStream(DEVICE_ID, true); // Ask the device to start streaming
      checkStreamStatus(); // Check the status again
    } catch (error) {
      setLastError('Failed to send start request.');
      setStreamStatus('error');
    }
  };

  const streamUrl = `${RELAY_BASE}/stream/view/${DEVICE_ID}`;
  const renderContent = () => {
    switch (streamStatus) {
      case 'connecting':
        return (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Connecting to stream...</Text>
          </View>
        );
      case 'online':
        return (
          <WebView
            originWhitelist={['*']}
            source={{ uri: streamUrl }}
            style={styles.webview}
            onError={() => setStreamStatus('error')}
          />
        );
      case 'offline':
      case 'error':
      default:
        return (
          <View style={styles.offline}>
            <Text style={styles.offlineText}>STREAM OFFLINE</Text>
            {lastError && <Text style={styles.errorText}>{lastError}</Text>}
            <TouchableOpacity style={styles.startButton} onPress={handleStartStream}>
              <Text style={styles.buttonText}>Start Stream</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Apollo Fire Device</Text>
      <View style={styles.videoWrap}>
        {renderContent()}
      </View>
    </SafeAreaView>
  )
}

const { width } = Dimensions.get('window')
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4))

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F3F4F6',
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
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
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stat: {
    fontSize: 16,
    color: '#374151',
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
    marginTop: 12,
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 13,
  },
  actions: {
    marginTop: 12,
    alignItems: 'center',
  },
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
  buttonText: {
    fontWeight: '700',
  },
  startButton: {
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
  },
})
