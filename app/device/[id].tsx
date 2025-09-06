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
  const [debugInfo, setDebugInfo] = useState<string>('');
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
      setDebugInfo(`Attempting to get ${mode} stream URL...`);

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

        setDebugInfo(`Stream URL: ${finalUrl}`);

        if (mountedRef.current) {
          setStreamUrl(finalUrl);
        }
      } catch (e: any) {
        if (mountedRef.current) {
          setStreamError(e.message);
          setDebugInfo(`Error: ${e.message}`);
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

  // --- Handle WebView messages ---
  const handleWebViewMessage = (event: any) => {
    const message = event.nativeEvent.data;
    console.log('WebView message:', message);

    if (message.startsWith('DEBUG:')) {
      setDebugInfo(message.replace('DEBUG:', ''));
    } else if (message === 'STREAM_LOADED') {
      setIsLoading(false);
      setStreamError(null);
    } else if (message.startsWith('STREAM_ERROR:')) {
      setStreamError(message.replace('STREAM_ERROR:', ''));
      setIsLoading(false);
    }
  };

  // --- Render Functions ---
  const renderContent = () => {
    // State 1: An error has occurred.
    if (streamError) {
      return (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>STREAM OFFLINE</Text>
          <Text style={styles.errorText}>{streamError}</Text>
          <Text style={styles.debugText}>{debugInfo}</Text>
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
          <Text style={styles.debugText}>{debugInfo}</Text>
        </View>
      );
    }

    // State 3: We have a URL, render the WebView with enhanced MJPEG handling
    return (
      <>
        <WebView
          // Update just the WebView HTML content in your existing code
          source={{
            html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
                  <style>
                    body, html { margin: 0; padding: 0; width: 100vw; height: 100vh; overflow: hidden; background-color: #000; }
                    .stream {
                      position: absolute;
                      top: 0;
                      left: 0;
                      width: 100%;
                      height: 100%;
                      object-fit: contain;
                    }
                    /* Hide the back buffer */
                    .back {
                      visibility: hidden;
                    }
                  </style>
                </head>
                <body>
                  <img id="stream1" class="stream" />
                  <img id="stream2" class="stream back" />
          
                  <script>
                    const buffers = [
                      document.getElementById('stream1'),
                      document.getElementById('stream2')
                    ];
                    let currentBuffer = 0;
          
                    function uint8ArrayToBase64(bytes) {
                      let binary = '';
                      const len = bytes.byteLength;
                      for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                      }
                      return window.btoa(binary);
                    }
          
                    const SOI = new Uint8Array([0xFF, 0xD8]);
                    const EOI = new Uint8Array([0xFF, 0xD9]);
          
                    fetch("${streamUrl}")
                      .then(response => response.body.getReader())
                      .then(reader => {
                        let buffer = new Uint8Array();
                        let frameCount = 0;
          
                        function findBytes(arr, search, startIndex = 0) {
                          for (let i = startIndex; i <= arr.length - search.length; i++) {
                            let found = true;
                            for (let j = 0; j < search.length; j++) {
                              if (arr[i+j] !== search[j]) { found = false; break; }
                            }
                            if (found) return i;
                          }
                          return -1;
                        }
          
                        function process() {
                          reader.read().then(({ done, value }) => {
                            if (done) return;
          
                            let newBuffer = new Uint8Array(buffer.length + value.length);
                            newBuffer.set(buffer);
                            newBuffer.set(value, buffer.length);
                            buffer = newBuffer;
          
                            let soiIndex = findBytes(buffer, SOI);
                            while (soiIndex !== -1) {
                              let eoiIndex = findBytes(buffer, EOI, soiIndex);
                              if (eoiIndex !== -1) {
                                const jpegData = buffer.slice(soiIndex, eoiIndex + EOI.length);
                                
                                const visible = buffers[currentBuffer];
                                const hidden = buffers[1 - currentBuffer];
          
                                hidden.onload = () => {
                                  // When the hidden image loads, swap visibility
                                  visible.classList.add('back');
                                  hidden.classList.remove('back');
                                  currentBuffer = 1 - currentBuffer; // Switch buffers
                                };
                                
                                const base64 = uint8ArrayToBase64(jpegData);
                                hidden.src = 'data:image/jpeg;base64,' + base64;
                                
                                frameCount++;
                                if (frameCount === 1) {
                                  window.ReactNativeWebView.postMessage('STREAM_LOADED');
                                }
                                
                                buffer = buffer.slice(eoiIndex + EOI.length);
                                soiIndex = findBytes(buffer, SOI);
                              } else {
                                break;
                              }
                            }
                            
                            process();
                          });
                        }
                        process();
                      });
                  </script>
                </body>
              </html>
            `,
          }}
          style={styles.webview}
          onMessage={handleWebViewMessage}
          onError={(event) => {
            setStreamError(`WebView error: ${event.nativeEvent.description}`);
            setIsLoading(false);
          }}
          onLoadEnd={() => {
            console.log('WebView loaded');
          }}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          mixedContentMode="compatibility"
        />
        {/* The loader is rendered ON TOP of the WebView */}
        {isLoading && (
          <View style={[StyleSheet.absoluteFill, styles.centered, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={[styles.loadingText, { color: '#ffffff' }]}>Connecting to Stream...</Text>
            <Text style={[styles.debugText, { color: '#ffffff' }]}>{debugInfo}</Text>
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
        <View style={styles.row}>
          <Text style={styles.stat}>🌡️ Temperature:</Text>
          <Text style={[styles.value, typeof readings.temperature === 'number' && readings.temperature > 45 && styles.alert]}>
            {readings.temperature}°C
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.stat}>💨 Gas Level:</Text>
          <Text style={[styles.value, typeof readings.gasValue === 'number' && readings.gasValue > 1000 && styles.alert]}>
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
  debugText: { marginTop: 8, color: '#6B7280', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
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