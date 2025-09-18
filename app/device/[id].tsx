import { db, requestStream, setStreamMode, subscribeToDevice, subscribeToRelayStream } from '@/src/services/firebaseConfig';
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

// Optimized helper function to convert raw binary data to a base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process in chunks to avoid blocking
  let binary = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

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
  const [showPerformance, setShowPerformance] = useState(false);
  const [streamQuality, setStreamQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const httpPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (mode === 'relay') {
        // Subscribe to relay stream updates
        const unsubscribeRelay = subscribeToRelayStream(deviceId, (relayUrl) => {
          if (relayUrl) {
            setStreamUrl(relayUrl);
            setIsLoading(false);
          } else {
            setStreamError('Relay stream not available. Device may be offline.');
            setIsLoading(false);
          }
        });
        
        // Store unsubscribe function for cleanup
        (window as any).relayUnsubscribe = unsubscribeRelay;
        return;
      }
      
      // Local streaming logic
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

    // Network state monitoring
    const monitorNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync();
        if (currentMode === 'local' && networkState.type !== Network.NetworkStateType.WIFI) {
          setStreamError('Lost Wi-Fi connection. Switching to relay mode...');
          if (deviceId) setStreamMode(deviceId, 'relay');
        }
      } catch (error) {
        console.error('Network monitoring error:', error);
      }
    };

    // Monitor network every 5 seconds
    const networkInterval = setInterval(monitorNetwork, 5000);
    monitorNetwork(); // Initial check

    return () => {
      unsubscribeControls();
      unsubscribeReadings();
      clearInterval(networkInterval);
      if ((window as any).relayUnsubscribe) {
        (window as any).relayUnsubscribe();
        (window as any).relayUnsubscribe = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (scheduledSwapRef.current) {
        clearTimeout(scheduledSwapRef.current);
        scheduledSwapRef.current = null;
      }
      if (httpPollingRef.current) {
        clearInterval(httpPollingRef.current);
        httpPollingRef.current = null;
      }
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      if (deviceId) requestStream(deviceId, false);
    };
  }, [deviceId, currentMode]);

  useEffect(() => {
    getStreamUrl(currentMode);
  }, [currentMode, getStreamUrl]);

  // --- Optimized frame timing and buffer refs ---
  const [frameRate, setFrameRate] = useState(10); // Start with lower frame rate
  const FRAME_INTERVAL = Math.round(1000 / frameRate);

  // Quality-based frame rate adjustment
  useEffect(() => {
    const qualitySettings = {
      low: 8,    // Reduced for stability
      medium: 12, // Reduced for stability
      high: 20   // Reduced for stability
    };
    setFrameRate(qualitySettings[streamQuality]);
  }, [streamQuality]);

  const bufferARef = useRef<string | null>(null);
  const bufferBRef = useRef<string | null>(null);
  const loadedARef = useRef(false);
  const loadedBRef = useRef(false);
  const lastSwapRef = useRef<number>(0);
  const scheduledSwapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const performanceRef = useRef({ droppedFrames: 0, totalFrames: 0 });

  // Simplified frame swapping - immediate display for responsiveness
  function scheduleSwapIfReady(buffer: 'A' | 'B') {
    const loaded = buffer === 'A' ? loadedARef.current : loadedBRef.current;
    if (!loaded) return;

    const now = Date.now();
    const since = now - (lastSwapRef.current || 0);

    // Performance tracking
    performanceRef.current.totalFrames++;
    
    // Simplified logic - always swap if enough time has passed
    if (since >= FRAME_INTERVAL * 0.5) { // More aggressive swapping
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

    // Only schedule if we're not already scheduled
    if (!scheduledSwapRef.current) {
      const delay = Math.max(FRAME_INTERVAL - since, 16); // Minimum 16ms delay
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
  }

  // Auto-reconnect function
  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setStreamError('Max reconnection attempts reached. Please refresh.');
      return;
    }

    reconnectAttempts.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 10000); // Exponential backoff, max 10s
    
    reconnectTimeoutRef.current = setTimeout(() => {
      if (streamUrl && currentMode === 'local') {
        console.log(`Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`);
        getStreamUrl(currentMode);
      }
    }, delay);
  }, [streamUrl, currentMode, getStreamUrl]);

  useEffect(() => {
    if (!streamUrl) {
      ws.current?.close();
      return;
    }

    // Clean up existing connection and reconnect timeout
    if (ws.current) {
      ws.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    let wsUrl: string;
    if (currentMode === 'local') {
      wsUrl = streamUrl.startsWith('ws://') ? streamUrl : streamUrl.replace('http://', 'ws://').replace('/stream', '/ws');
    } else {
      // For relay mode, use the stream URL directly (could be WebSocket or HTTP)
      wsUrl = streamUrl;
    }

    // Only create WebSocket for local mode or if URL is WebSocket
    if (currentMode === 'local' || wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://')) {
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = 'arraybuffer';

      ws.current.onopen = () => {
        setIsLoading(false);
        setStreamError(null);
        reconnectAttempts.current = 0; // Reset on successful connection
        // reset buffers on fresh open
        bufferARef.current = null;
        bufferBRef.current = null;
        loadedARef.current = false;
        loadedBRef.current = false;
        setFrameA(null);
        setFrameB(null);
        lastSwapRef.current = 0;
        frameCountRef.current = 0;
        lastFrameTimeRef.current = 0;
        performanceRef.current = { droppedFrames: 0, totalFrames: 0 };
        if (scheduledSwapRef.current) {
          clearTimeout(scheduledSwapRef.current);
          scheduledSwapRef.current = null;
        }
        console.log('WebSocket connected successfully');
      };

      ws.current.onerror = (error) => {
        setStreamError('Connection error. Check network and try again.');
        setIsLoading(false);
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setFrameA(null);
        setFrameB(null);
        bufferARef.current = null;
        bufferBRef.current = null;
        loadedARef.current = false;
        loadedBRef.current = false;
        
        if (event.code !== 1000) { // Not a normal closure
          setStreamError('Connection lost. Attempting to reconnect...');
          attemptReconnect();
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const now = Date.now();
          frameCountRef.current++;
          
          // Skip frames if we're receiving them too fast (more aggressive)
          if (lastFrameTimeRef.current > 0 && now - lastFrameTimeRef.current < FRAME_INTERVAL * 0.3) {
            performanceRef.current.droppedFrames++;
            return;
          }
          lastFrameTimeRef.current = now;

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
        } catch (error) {
          console.error('Error processing frame:', error);
        }
      };
    } else {
      // For HTTP relay streams - implement simple image polling
      setIsLoading(false);
      setStreamError(null);
      
      // Start HTTP polling for relay mode
      const startHttpPolling = () => {
        if (httpPollingRef.current) {
          clearInterval(httpPollingRef.current);
        }
        
        httpPollingRef.current = setInterval(async () => {
          try {
            const response = await fetch(wsUrl, {
              method: 'GET',
              headers: {
                'Cache-Control': 'no-cache',
              },
            });
            
            if (response.ok) {
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onload = () => {
                const dataUri = reader.result as string;
                
                // Write to inactive buffer
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
              reader.readAsDataURL(blob);
            } else {
              console.warn('HTTP polling failed:', response.status);
            }
          } catch (error) {
            console.error('HTTP polling error:', error);
            setStreamError('Failed to fetch relay stream');
          }
        }, 1000 / frameRate); // Poll at current frame rate
      };
      
      startHttpPolling();
      console.log('Started HTTP polling for relay stream:', wsUrl);
    }

    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (httpPollingRef.current) {
        clearInterval(httpPollingRef.current);
        httpPollingRef.current = null;
      }
    };
  }, [streamUrl, currentMode]);

  const handleModeSwitch = (mode: 'local' | 'relay') => {
    if (deviceId) {
      // Reset performance metrics on mode switch
      performanceRef.current = { droppedFrames: 0, totalFrames: 0 };
      reconnectAttempts.current = 0;
      setStreamMode(deviceId, mode);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>
            {currentMode === 'local' ? 'Connecting to device...' : 'Connecting to relay...'}
          </Text>
        </View>
      );
    }
    
    if (streamError) {
      return (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>STREAM OFFLINE</Text>
          <Text style={styles.errorText}>{streamError}</Text>
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={() => getStreamUrl(currentMode)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!streamUrl) {
      return (
        <View style={styles.offline}>
          <Text style={styles.offlineText}>NO STREAM AVAILABLE</Text>
          <Text style={styles.errorText}>
            {currentMode === 'local' 
              ? 'Device is not streaming locally' 
              : 'Relay stream not available'
            }
          </Text>
        </View>
      );
    }

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
          onError={(error) => {
            console.error('Image load error for frame A:', error);
            loadedARef.current = false;
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
          onError={(error) => {
            console.error('Image load error for frame B:', error);
            loadedBRef.current = false;
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
      <View style={styles.videoWrap}>
        {renderContent()}
        {showPerformance && (
          <View style={styles.performanceOverlay}>
            <Text style={styles.performanceText}>FPS: {frameRate}</Text>
            <Text style={styles.performanceText}>
              Dropped: {Math.round((performanceRef.current.droppedFrames / Math.max(performanceRef.current.totalFrames, 1)) * 100)}%
            </Text>
            <Text style={styles.performanceText}>Mode: {currentMode.toUpperCase()}</Text>
          </View>
        )}
        <TouchableOpacity 
          style={styles.performanceToggle}
          onPress={() => setShowPerformance(!showPerformance)}
        >
          <Text style={styles.performanceToggleText}>📊</Text>
        </TouchableOpacity>
        {showPerformance && (
          <View style={styles.qualitySelector}>
            <Text style={styles.qualityLabel}>Quality:</Text>
            <TouchableOpacity 
              style={[styles.qualityButton, streamQuality === 'low' && styles.qualityActive]}
              onPress={() => setStreamQuality('low')}
            >
              <Text style={[styles.qualityButtonText, streamQuality === 'low' && styles.qualityButtonActive]}>Low</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.qualityButton, streamQuality === 'medium' && styles.qualityActive]}
              onPress={() => setStreamQuality('medium')}
            >
              <Text style={[styles.qualityButtonText, streamQuality === 'medium' && styles.qualityButtonActive]}>Med</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.qualityButton, streamQuality === 'high' && styles.qualityActive]}
              onPress={() => setStreamQuality('high')}
            >
              <Text style={[styles.qualityButtonText, streamQuality === 'high' && styles.qualityButtonActive]}>High</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  retryButton: { 
    marginTop: 16, 
    backgroundColor: '#3B82F6', 
    paddingHorizontal: 24, 
    paddingVertical: 12, 
    borderRadius: 8 
  },
  retryButtonText: { 
    color: '#FFFFFF', 
    fontWeight: '600', 
    fontSize: 16 
  },
  performanceOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 6,
    minWidth: 120,
  },
  performanceText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  performanceToggle: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 6,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  performanceToggleText: {
    fontSize: 16,
  },
  qualitySelector: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qualityLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  qualityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  qualityActive: {
    backgroundColor: '#3B82F6',
  },
  qualityButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  qualityButtonActive: {
    color: '#FFFFFF',
  },
});