import { db, requestStream, setStreamMode, subscribeToDevice } from '@/src/services/firebaseConfig';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { get, onValue, ref } from 'firebase/database';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Readings = {
  temperature: number | 'N/A';
  gasValue: number | 'N/A';
  isFlameDetected: boolean;
  isCriticalAlert: boolean;
  lastUpdate: number | 'N/A';
};
type StreamStatus = 'connecting' | 'online' | 'offline' | 'error';

export default function DeviceDetailScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<'local' | 'relay'>('relay');
  const [readings, setReadings] = useState<Readings>({
    temperature: 'N/A', gasValue: 'N/A', isFlameDetected: false, isCriticalAlert: false, lastUpdate: 'N/A',
  });

  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Device: ${deviceId?.slice(0, 12)}...` });
  }, [navigation, deviceId]);

  useEffect(() => {
    if (!deviceId) return;

    mountedRef.current = true;

    const modeRef = ref(db, `devices/${deviceId}/controls/streamMode`);
    const unsubscribeMode = onValue(modeRef, (snapshot) => {
      const mode = snapshot.exists() ? snapshot.val() : 'relay';
      if (mountedRef.current) {
        setCurrentMode(mode);
        fetchStreamUrl(mode);
      }
    });

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

    const fetchStreamUrl = async (mode: 'local' | 'relay') => {
      if (!deviceId) return;
      try {
        let finalUrl = '';
        if (mode === 'relay') {
          const urlRef = ref(db, `devices/${deviceId}/streamBaseUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists()) {
            finalUrl = `${snapshot.val()}/stream/view/${deviceId}`;
          } else {
            throw new Error('Relay stream URL not configured.');
          }
        } else {
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
          checkStreamStatus(finalUrl);
        }
      } catch (e: any) {
        if (mountedRef.current) {
            setStreamUrl(null);
            setLastError(e.message);
            setStreamStatus('error');
        }
      }
    };

    return () => {
      mountedRef.current = false;
      unsubscribeMode();
      unsubscribeReadings();
    };
  }, [deviceId]);

  const checkStreamStatus = async (urlToCheck: string) => {
    if (!mountedRef.current || !urlToCheck) return;
    setStreamStatus('connecting');
    setLastError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(urlToCheck, { signal: controller.signal });
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
  };

  const handleStartStream = async () => {
    if (!deviceId) return;
    try {
      await requestStream(deviceId, true);
    } catch (error) {
      setLastError('Failed to send start request.');
    }
  };

  const renderContent = () => {
    if (!streamUrl && streamStatus !== 'offline' && streamStatus !== 'error') {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading Stream...</Text>
        </View>
      );
    }
    switch (streamStatus) {
      case 'online':
        return <WebView source={{ uri: streamUrl! }} style={styles.webview} />;
      default:
        return (
          <View style={styles.offline}>
            <Text style={styles.offlineText}>STREAM OFFLINE</Text>
            {lastError && <Text style={styles.errorText}>{lastError}</Text>}
            <TouchableOpacity style={styles.startButton} onPress={handleStartStream}>
              <Text style={styles.buttonText}>Request Stream</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  if (!deviceId) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>No Device ID provided.</Text>
      </SafeAreaView>
    );
  }

  const lastUpdateDate = readings.lastUpdate !== 'N/A' ? new Date(readings.lastUpdate).toLocaleString() : 'N/A';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoWrap}>{renderContent()}</View>

      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={[styles.selectorButton, currentMode === 'local' && styles.selectorActive]}
          onPress={() => setStreamMode(deviceId, 'local')}>
          <Text style={[styles.selectorText, currentMode === 'local' && styles.selectorTextActive]}>Local</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorButton, currentMode === 'relay' && styles.selectorActive]}
          onPress={() => setStreamMode(deviceId, 'relay')}>
          <Text style={[styles.selectorText, currentMode === 'relay' && styles.selectorTextActive]}>Relay</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.card}>
        <View style={styles.row}>
            <Text style={styles.stat}>🌡️ Temperature:</Text>
            <Text style={[styles.value, readings.temperature as number > 45 && styles.alert]}>
                {readings.temperature}°C
            </Text>
        </View>
        <View style={styles.row}>
            <Text style={styles.stat}>💨 Gas Level:</Text>
            <Text style={[styles.value, readings.gasValue as number > 1000 && styles.alert]}>
                {readings.gasValue}
            </Text>
        </View>
        <View style={styles.row}>
            <Text style={styles.stat}>🔥 Flame Detected:</Text>
            <Text style={[styles.value, readings.isFlameDetected && styles.alert]}>
                {readings.isFlameDetected ? 'YES' : 'No'}
            </Text>
        </View>
         <View style={[styles.row, { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4 }]}>
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

const { width } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4));

const styles = StyleSheet.create({
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