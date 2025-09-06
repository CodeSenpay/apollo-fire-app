
import { db, requestStream, setStreamMode, subscribeToDevice } from '@/src/services/firebaseConfig';
import Ionicons from '@expo/vector-icons/build/Ionicons';
import { Video } from 'expo-av';
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

type StreamType = 'mjpeg' | 'hls' | 'unknown' | null;

// --- Component ---
export default function DeviceDetailScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const mountedRef = useRef(true);

  const [isWifiConnected, setIsWifiConnected] = useState(true);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamType, setStreamType] = useState<StreamType>(null);
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

  // WebView tuning
  const [reloadKey, setReloadKey] = useState(0);
  const reloadCountRef = useRef(0);

  // Increase retries and timeout
  const MAX_RELOADS = 12;
  const WEBVIEW_FIRST_FRAME_TIMEOUT = 20000; // 20 seconds

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

  const isLocalIp = (url: string) => {
    try {
      const u = new URL(url);
      return /^(10\.|192\.168\.|127\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(u.hostname);
    } catch {
      return false;
    }
  };

  const probeStream = useCallback(async (url: string) => {
    const controller = new AbortController();
    const timeoutMs = 5000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'multipart/x-mixed-replace, image/*, */*',
          'User-Agent': 'Mozilla/5.0 (Mobile) AppleWebKit/537.36',
        },
        signal: controller.signal,
      });
      const ct = res.headers.get('content-type') || '';
      clearTimeout(timeoutId);
      return ct.toLowerCase();
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }, []);

  const getStreamUrl = useCallback(
    async (mode: 'local' | 'relay') => {
      if (!deviceId) return;
      if (mountedRef.current) {
        setIsLoading(true);
        setStreamError(null);
        setStreamUrl(null);
        setStreamType(null);
        setReloadKey(k => k + 1);
        reloadCountRef.current = 0;
      }

      try {
        let finalUrl = '';
        if (mode === 'relay') {
          const urlRef = ref(db, `devices/${deviceId}/streamBaseUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists() && snapshot.val()) {
            finalUrl = `${snapshot.val()}/stream/view/${deviceId}`;
          } else {
            throw new Error('Relay stream URL not configured in Firebase.');
          }
        } else {
          const networkState = await Network.getNetworkStateAsync();
          const wifiIsOn = networkState.type === Network.NetworkStateType.WIFI;
          if (mountedRef.current) setIsWifiConnected(wifiIsOn);
          if (!wifiIsOn) {
            throw new Error('You must be on Wi-Fi for local streaming.');
          }
          const urlRef = ref(db, `devices/${deviceId}/controls/streamUrl`);
          const snapshot = await get(urlRef);
          if (snapshot.exists() && snapshot.val()) {
            finalUrl = snapshot.val();
          } else {
            throw new Error('Device has not published a local stream URL.');
          }
        }

        console.log('finalStreamUrl', finalUrl);
        if (mountedRef.current) setStreamUrl(finalUrl);

        // For local IPs prefer WebView fallback
        if (isLocalIp(finalUrl)) {
          if (mountedRef.current) setStreamType('unknown');
          return;
        }

        // non-local: try lightweight probe
        try {
          const contentType = await probeStream(finalUrl);
          console.log('probe content-type', contentType);
          if (
            contentType.includes('application/vnd.apple.mpegurl') ||
            contentType.includes('application/x-mpegurl') ||
            finalUrl.toLowerCase().includes('.m3u8')
          ) {
            if (mountedRef.current) setStreamType('hls');
            return;
          }
          if (
            contentType.includes('multipart/x-mixed-replace') ||
            contentType.includes('image/jpeg') ||
            contentType.includes('image')
          ) {
            if (mountedRef.current) setStreamType('mjpeg');
            return;
          }
          if (mountedRef.current) setStreamType('unknown');
        } catch (probeErr: any) {
          console.log('probe error fallback', probeErr);
          if (mountedRef.current) setStreamType('unknown');
        }
      } catch (e: any) {
        if (mountedRef.current) {
          setStreamError(e.message || 'Failed to get stream URL.');
          setIsLoading(false);
        }
      }
    },
    [deviceId, probeStream]
  );

  useEffect(() => {
    if (!deviceId) return;
    mountedRef.current = true;

    const controlsRef = ref(db, `devices/${deviceId}/controls`);
    const unsubscribeControls = onValue(controlsRef, (snapshot) => {
      const controls = snapshot.val();
      if (mountedRef.current && controls) {
        const newMode = controls.streamMode || 'relay';
        setCurrentMode(newMode);
      }
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

    requestStream(deviceId, true);

    return () => {
      mountedRef.current = false;
      unsubscribeControls();
      unsubscribeReadings();
      if (deviceId) requestStream(deviceId, false);
    };
  }, [deviceId]);

  useEffect(() => {
    getStreamUrl(currentMode);
  }, [currentMode, getStreamUrl]);

  useEffect(() => {
    if (streamUrl && !streamType) setIsLoading(true);
  }, [streamUrl, streamType]);

  // Improved MJPEG HTML
  const mjpegHtml = (uri: string) => `
    <!doctype html>
    <html>
      <head>
        <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0" />
        <style>
          html,body { margin:0; padding:0; height:100%; background:black; }
          img { width:100%; height:100%; object-fit:contain; display:block; }
        </style>
      </head>
      <body>
        <img id="cam" />
        <script>
          (function() {
            const uri = '${uri}';
            let img = document.getElementById('cam');
            let firstFrame = false;
            let retryCount = 0;
            const MAX_RETRY = 50;
            const RETRY_DELAY = 800;

            function setSrcWithCacheBuster() {
              img.src = uri + '?r=' + Date.now();
            }

            function start() {
              img.onload = function() {
                if (firstFrame) return;
                firstFrame = true;
                // try to ensure decode finished
                if (img.decode) {
                  img.decode().then(() => {
                    window.ReactNativeWebView.postMessage('loaded');
                  }).catch(() => {
                    window.ReactNativeWebView.postMessage('loaded');
                  });
                } else {
                  window.ReactNativeWebView.postMessage('loaded');
                }
              };

              img.onerror = function() {
                retryCount++;
                if (retryCount <= MAX_RETRY) {
                  setTimeout(setSrcWithCacheBuster, RETRY_DELAY);
                } else {
                  window.ReactNativeWebView.postMessage('error');
                }
              };

              // periodic refresh if no first frame
              const t = setInterval(function() {
                if (!firstFrame && retryCount <= MAX_RETRY) {
                  setSrcWithCacheBuster();
                } else {
                  clearInterval(t);
                }
              }, 3000);

              // initial load
              setSrcWithCacheBuster();
            }

            // start after short delay to allow WebView to fully initialize
            setTimeout(start, 200);
          })();
        </script>
      </body>
    </html>
  `;

  // WebView message handler
  const handleWebViewMessage = (event: any) => {
    const msg = event.nativeEvent.data;
    if (msg === 'loaded') {
      if (mountedRef.current) {
        setIsLoading(false);
        setStreamError(null);
        reloadCountRef.current = 0;
      }
    }
    if (msg === 'error') {
      if (!mountedRef.current) return;
      reloadCountRef.current += 1;
      if (reloadCountRef.current <= MAX_RELOADS) {
        setIsLoading(true);
        setReloadKey(k => k + 1);
      } else {
        setStreamError('Failed to load stream after multiple attempts');
        setIsLoading(false);
      }
    }
  };

  const handleWebViewError = (e: any) => {
    console.log('WebView error', e.nativeEvent);
    if (!mountedRef.current) return;
    reloadCountRef.current += 1;
    if (reloadCountRef.current <= MAX_RELOADS) {
      setIsLoading(true);
      setReloadKey(k => k + 1);
      return;
    }
    setStreamError('WebView failed repeatedly');
    setIsLoading(false);
  };

  // Fallback timer that forces a reload if first-frame does not arrive
  useEffect(() => {
    if (streamType !== 'mjpeg' && streamType !== 'unknown') return;
    if (!streamUrl) return;
    if (!isLoading) return;
    const t = setTimeout(() => {
      if (!mountedRef.current) return;
      reloadCountRef.current += 1;
      if (reloadCountRef.current <= MAX_RELOADS) {
        setReloadKey(k => k + 1);
      } else {
        setStreamError('Stream did not start within timeout');
        setIsLoading(false);
      }
    }, WEBVIEW_FIRST_FRAME_TIMEOUT);
    return () => clearTimeout(t);
  }, [streamType, streamUrl, isLoading, reloadKey]);

  const renderMJPEG = (uri: string) => {
    return (
      <WebView
        key={`mjpeg-${reloadKey}`}
        originWhitelist={['*']}
        source={{ html: mjpegHtml(uri) }}
        style={styles.webview}
        onMessage={handleWebViewMessage}
        onError={handleWebViewError}
        onLoadEnd={() => {
          // keep loader until 'loaded' arrives
        }}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        cacheEnabled={false}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        userAgent={'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'}
        mixedContentModeIOS={'always' as any}
        mixedContentModeAndroid={'always' as any}
        injectedJavaScriptBeforeContentLoaded={''}
      />
    );
  };

  const renderHLS = (uri: string) => {
    return (
      <Video
        source={{ uri }}
        style={styles.webview}
        shouldPlay
        useNativeControls
        // resizeMode="contain"
        onLoad={() => {
          if (mountedRef.current) setIsLoading(false);
        }}
        onError={(e) => {
          console.log('Video error', e);
          if (mountedRef.current) {
            setStreamError('Video player failed to load the stream');
            setIsLoading(false);
          }
        }}
      />
    );
  };

  const renderUnknown = (uri: string) => renderMJPEG(uri);

  const handleRetry = () => {
    reloadCountRef.current = 0;
    setReloadKey(k => k + 1);
    getStreamUrl(currentMode);
  };
  const handleModeSwitch = (mode: 'local' | 'relay') => setStreamMode(deviceId!, mode);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Connecting to Stream...</Text>
        </View>
      );
    }

    if (streamError || !streamUrl) {
      return (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>STREAM OFFLINE</Text>
          <Text style={styles.errorText}>{streamError || 'Could not get stream URL.'}</Text>
          <TouchableOpacity style={styles.startButton} onPress={handleRetry}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!streamType) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Detecting stream type...</Text>
        </View>
      );
    }

    if (streamType === 'hls') return renderHLS(streamUrl);
    if (streamType === 'mjpeg') return renderMJPEG(streamUrl);
    return renderUnknown(streamUrl);
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
  offline: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 10 },
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
