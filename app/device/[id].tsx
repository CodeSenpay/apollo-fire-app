import {
  getDeviceReadings,
  getRelayStreamUrl,
  requestStream,
  setStreamMode,
} from "@/src/services/apiConfig";
import {
  connectSocket,
  subscribeToDevice,
  unsubscribeFromDevice,
} from "@/src/state/socket";
import Ionicons from "@expo/vector-icons/build/Ionicons";
import { Link, useLocalSearchParams, useNavigation } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
} from "react-native";

// Helper function to convert raw binary data to a base64 string
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// --- Types ---
type Readings = {
  gasValue: number | "N/A";
  isFlameDetected: boolean;
  isCriticalAlert: boolean;
  lastUpdate: number | "N/A";
};

const FALLBACK_POLL_INTERVAL_MS = 60000; // 1 minute sanity check alongside realtime socket updates

// --- Main Component ---
// Replace the existing DeviceDetailScreen component with this version
export default function DeviceDetailScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const ws = useRef<WebSocket | null>(null);
  const loadTarget = useRef<"A" | "B">("B");
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // double buffer state for rendering
  const [frameA, setFrameA] = useState<string | null>(null);
  const [frameB, setFrameB] = useState<string | null>(null);
  const [activeFrame, setActiveFrame] = useState<"A" | "B">("A");

  // other state
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [currentMode, setCurrentMode] = useState<"local" | "relay">("local");
  const [readings, setReadings] = useState<Readings>({
    gasValue: "N/A",
    isFlameDetected: false,
    isCriticalAlert: false,
    lastUpdate: "N/A",
  });
  const [showPerformance, setShowPerformance] = useState(false);
  const [streamQuality, setStreamQuality] = useState<"low" | "medium" | "high">(
    "medium"
  );
  const latestReadingRef = useRef<number | null>(null);

  const httpPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: `Device: ${deviceId?.slice(0, 12)}...`,
      headerRight: () => (
        <Link
          href={{ pathname: "/device/settings", params: { id: deviceId } }}
          asChild
        >
          <Pressable style={{ marginRight: 15 }}>
            <Ionicons name="settings-outline" size={24} color="#1F2937" />
          </Pressable>
        </Link>
      ),
    });
  }, [navigation, deviceId]);

  const getStreamUrl = useCallback(
    async (mode: "local" | "relay") => {
      if (!deviceId) return;
      setIsLoading(true);
      setStreamError(null);
      setStreamUrl(null);

      try {
        // Get stream URL from database for both local and relay modes
        const dbStreamUrl = await getRelayStreamUrl(deviceId);
        
        if (dbStreamUrl) {
          console.log(`Stream URL from database (${mode} mode):`, dbStreamUrl);
          setStreamUrl(dbStreamUrl);
          setIsLoading(false);
        } else {
          setStreamError(
            `${mode === 'local' ? 'Local' : 'Relay'} stream not available. Device may be offline or not streaming.`
          );
          setIsLoading(false);
        }
      } catch (e: any) {
        console.error('Error fetching stream URL:', e);
        setStreamError(e.message || 'Failed to fetch stream URL');
        setIsLoading(false);
      }
    },
    [deviceId]
  );

  useEffect(() => {
    if (!deviceId) return;

    requestStream(deviceId, true);

    // Poll device readings from API as a fallback sanity check
    const pollReadings = async () => {
      try {
        const data = await getDeviceReadings(deviceId);
        if (data) {
          setReadings({
            gasValue: typeof data.gasValue === "number" ? data.gasValue : "N/A",
            isFlameDetected: !!data.isFlameDetected,
            isCriticalAlert: !!data.isCriticalAlert,
            lastUpdate:
              typeof data.lastUpdate === "number" ? data.lastUpdate : "N/A",
          });
        }
      } catch (error) {
        console.error("Error fetching device readings:", error);
      }
    };

    // Initial fetch
    pollReadings();

    // Poll periodically in case socket events are missed
    const readingsInterval = setInterval(
      pollReadings,
      FALLBACK_POLL_INTERVAL_MS
    );

    return () => {
      clearInterval(readingsInterval);
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
      // Clear message queue and reset processing state
      messageQueueRef.current = [];
      processingMessageRef.current = false;
      if (frameProcessingTimeoutRef.current) {
        clearTimeout(frameProcessingTimeoutRef.current);
        frameProcessingTimeoutRef.current = null;
      }
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
      if (deviceId) requestStream(deviceId, false);
    };
  }, [deviceId]);

  useEffect(() => {
    getStreamUrl(currentMode);
  }, [currentMode, getStreamUrl]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    const attachSocket = async () => {
      await connectSocket();
      if (cancelled) return;
      subscribeToDevice(deviceId, {
        sensorData: (payload) => {
          latestReadingRef.current = payload.timestamp || Date.now();
          setReadings({
            gasValue:
              typeof payload.gasValue === "number" ? payload.gasValue : "N/A",
            isFlameDetected: Boolean(payload.isFlameDetected),
            isCriticalAlert: Boolean(payload.isCriticalAlert),
            lastUpdate: latestReadingRef.current,
          });
        },
        streamMode: ({ mode }) => {
          setCurrentMode(mode);
        },
        streamUrl: ({ streamUrl: nextUrl }) => {
          setStreamUrl(nextUrl || null);
          setIsLoading(false);
        },
        streamStatus: ({ status }) => {
          if (status === "active") {
            setStreamError(null);
          }
        },
        mlAlert: (payload) => {
          console.log("Realtime ML alert", payload);
        },
      });
    };

    attachSocket();

    return () => {
      cancelled = true;
      unsubscribeFromDevice(deviceId);
    };
  }, [deviceId]);

  // --- Optimized frame timing and buffer refs ---
  const [frameRate, setFrameRate] = useState(10); // Optimized frame rate
  const FRAME_INTERVAL = Math.round(1000 / frameRate);

  // Quality-based frame rate adjustment - optimized for ESP32 output
  useEffect(() => {
    const qualitySettings = {
      low: 5, // Low - 5 FPS
      medium: 10, // Medium - 10 FPS (matches ESP32)
      high: 12, // High - 12 FPS
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

  // Message throttling and backpressure handling
  const messageQueueRef = useRef<ArrayBuffer[]>([]);
  const processingMessageRef = useRef(false);
  const lastProcessedMessageRef = useRef<number>(0);
  const maxQueueSize = 5; // Larger buffer for smoother playback
  const frameProcessingTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Optimized message processing for smooth playback
  const processMessageQueue = useCallback(async () => {
    if (processingMessageRef.current || messageQueueRef.current.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastProcess = now - lastProcessedMessageRef.current;

    // Minimal throttling - process frames as they arrive
    if (timeSinceLastProcess < FRAME_INTERVAL * 0.8) {
      const delay = Math.max(10, FRAME_INTERVAL * 0.8 - timeSinceLastProcess);
      frameProcessingTimeoutRef.current = setTimeout(
        processMessageQueue,
        delay
      );
      return;
    }

    processingMessageRef.current = true;

    // Process the latest message, drop older frames if queue is large
    const latestMessage = messageQueueRef.current.shift();
    if (messageQueueRef.current.length > 2) {
      // Drop middle frames, keep latest
      const latest = messageQueueRef.current.pop();
      const dropped = messageQueueRef.current.length;
      messageQueueRef.current = latest ? [latest] : [];
      performanceRef.current.droppedFrames += dropped;
    }

    if (latestMessage) {
      try {
        const base64Data = arrayBufferToBase64(latestMessage);
        const dataUri = `data:image/jpeg;base64,${base64Data}`;

        // Write to inactive buffer and mark it as not loaded yet
        if (loadTarget.current === "A") {
          bufferARef.current = dataUri;
          loadedARef.current = false;
          setFrameA(dataUri);
        } else {
          bufferBRef.current = dataUri;
          loadedBRef.current = false;
          setFrameB(dataUri);
        }

        lastProcessedMessageRef.current = now;
        performanceRef.current.totalFrames++;
      } catch (error) {
        console.error("Error processing frame:", error);
      }
    }

    processingMessageRef.current = false;

    // Schedule next processing if there are more messages
    if (messageQueueRef.current.length > 0) {
      frameProcessingTimeoutRef.current = setTimeout(
        processMessageQueue,
        10 // Process next frame quickly
      );
    }
  }, [FRAME_INTERVAL]);

  // Helper that will attempt a swap only if the buffer is loaded and the interval passed
  function scheduleSwapIfReady(buffer: "A" | "B") {
    const loaded = buffer === "A" ? loadedARef.current : loadedBRef.current;
    if (!loaded) return;

    const now = Date.now();
    const since = now - (lastSwapRef.current || 0);

    // if enough time passed do immediate swap
    if (since >= FRAME_INTERVAL) {
      lastSwapRef.current = now;
      setActiveFrame(buffer);
      // flip loadTarget for next incoming frame
      loadTarget.current = buffer === "A" ? "B" : "A";
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
      const stillLoaded =
        buffer === "A" ? loadedARef.current : loadedBRef.current;
      if (!stillLoaded) {
        scheduledSwapRef.current = null;
        return;
      }
      lastSwapRef.current = Date.now();
      setActiveFrame(buffer);
      loadTarget.current = buffer === "A" ? "B" : "A";
      scheduledSwapRef.current = null;
    }, delay);
  }

  // Auto-reconnect function
  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setStreamError("Max reconnection attempts reached. Please refresh.");
      return;
    }

    reconnectAttempts.current++;
    const delay = Math.min(
      1000 * Math.pow(2, reconnectAttempts.current - 1),
      10000
    ); // Exponential backoff, max 10s

    reconnectTimeoutRef.current = setTimeout(() => {
      if (streamUrl && currentMode === "local") {
        console.log(
          `Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`
        );
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
    if (currentMode === "local") {
      wsUrl = streamUrl.startsWith("ws://")
        ? streamUrl
        : streamUrl.replace("http://", "ws://").replace("/stream", "/ws");
    } else {
      // For relay mode, use the stream URL directly (could be WebSocket or HTTP)
      wsUrl = streamUrl;
    }

    // Only create WebSocket for local mode or if URL is WebSocket
    if (
      currentMode === "local" ||
      wsUrl.startsWith("ws://") ||
      wsUrl.startsWith("wss://")
    ) {
      ws.current = new WebSocket(wsUrl);
      ws.current.binaryType = "arraybuffer";

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
        // Reset message queue and processing state
        messageQueueRef.current = [];
        processingMessageRef.current = false;
        lastProcessedMessageRef.current = 0;
        if (scheduledSwapRef.current) {
          clearTimeout(scheduledSwapRef.current);
          scheduledSwapRef.current = null;
        }
        if (frameProcessingTimeoutRef.current) {
          clearTimeout(frameProcessingTimeoutRef.current);
          frameProcessingTimeoutRef.current = null;
        }
        console.log("WebSocket connected successfully");
      };

      ws.current.onerror = (error) => {
        setStreamError("Connection error. Check network and try again.");
        setIsLoading(false);
      };

      ws.current.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        setFrameA(null);
        setFrameB(null);
        bufferARef.current = null;
        bufferBRef.current = null;
        loadedARef.current = false;
        loadedBRef.current = false;
        // Clear message queue on close
        messageQueueRef.current = [];
        processingMessageRef.current = false;
        if (frameProcessingTimeoutRef.current) {
          clearTimeout(frameProcessingTimeoutRef.current);
          frameProcessingTimeoutRef.current = null;
        }

        if (event.code !== 1000) {
          // Not a normal closure
          setStreamError("Connection lost. Attempting to reconnect...");
          attemptReconnect();
        }
      };

      ws.current.onmessage = (event) => {
        try {
          const now = Date.now();
          frameCountRef.current++;

          // Add message to queue for processing
          const messageData = event.data as ArrayBuffer;

          // Drop oldest messages if queue is full
          if (messageQueueRef.current.length >= maxQueueSize) {
            messageQueueRef.current.shift(); // Remove oldest
            performanceRef.current.droppedFrames++;
          }

          // Add new message to queue
          messageQueueRef.current.push(messageData);

          // Trigger processing immediately if not already running
          if (!processingMessageRef.current) {
            processMessageQueue();
          }
        } catch (error) {
          console.error("Error queuing frame:", error);
          performanceRef.current.droppedFrames++;
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
              method: "GET",
              headers: {
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
              },
            });

            if (response.ok) {
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onload = () => {
                const dataUri = reader.result as string;

                // Write to inactive buffer
                if (loadTarget.current === "A") {
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
              console.warn("HTTP polling failed:", response.status);
            }
          } catch (error) {
            console.error("HTTP polling error:", error);
            setStreamError("Failed to fetch relay stream");
          }
        }, Math.max(FRAME_INTERVAL, 100)); // Poll at frame rate, minimum 100ms
      };

      startHttpPolling();
      console.log("Started HTTP polling for relay stream:", wsUrl);
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
      // Clear message queue on cleanup
      messageQueueRef.current = [];
      processingMessageRef.current = false;
      if (frameProcessingTimeoutRef.current) {
        clearTimeout(frameProcessingTimeoutRef.current);
        frameProcessingTimeoutRef.current = null;
      }
    };
  }, [streamUrl, currentMode]);

  const handleModeSwitch = (mode: "local" | "relay") => {
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
            {currentMode === "local"
              ? "Connecting to device..."
              : "Connecting to relay..."}
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
            {currentMode === "local"
              ? "Device is not streaming locally"
              : "Relay stream not available"}
          </Text>
        </View>
      );
    }

    return (
      <>
        <Image
          source={frameA ? { uri: frameA } : undefined}
          style={[
            StyleSheet.absoluteFill,
            { opacity: activeFrame === "A" ? 1 : 0 },
          ]}
          fadeDuration={0} // remove built in fade to avoid visual flicker
          onLoadEnd={() => {
            // mark buffer A loaded
            loadedARef.current = true;
            // only schedule swap for A if this buffer is most recent
            if (bufferARef.current && bufferARef.current === frameA) {
              scheduleSwapIfReady("A");
            }
          }}
          onError={(error) => {
            console.error("Image load error for frame A:", error);
            loadedARef.current = false;
          }}
          resizeMode="cover"
        />
        <Image
          source={frameB ? { uri: frameB } : undefined}
          style={[
            StyleSheet.absoluteFill,
            { opacity: activeFrame === "B" ? 1 : 0 },
          ]}
          fadeDuration={0}
          onLoadEnd={() => {
            loadedBRef.current = true;
            if (bufferBRef.current && bufferBRef.current === frameB) {
              scheduleSwapIfReady("B");
            }
          }}
          onError={(error) => {
            console.error("Image load error for frame B:", error);
            loadedBRef.current = false;
          }}
          resizeMode="cover"
        />
      </>
    );
  };

  if (!deviceId)
    return (
      <SafeAreaView style={styles.container}>
        <Text>No Device ID.</Text>
      </SafeAreaView>
    );
  const lastUpdateDate =
    readings.lastUpdate !== "N/A"
      ? new Date(readings.lastUpdate).toLocaleString()
      : "N/A";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.videoWrap}>
        {renderContent()}
        {showPerformance && (
          <View style={styles.performanceOverlay}>
            <Text style={styles.performanceText}>FPS: {frameRate}</Text>
            <Text style={styles.performanceText}>
              Dropped:{" "}
              {Math.round(
                (performanceRef.current.droppedFrames /
                  Math.max(performanceRef.current.totalFrames, 1)) *
                  100
              )}
              %
            </Text>
            <Text style={styles.performanceText}>
              Mode: {currentMode.toUpperCase()}
            </Text>
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
              style={[
                styles.qualityButton,
                streamQuality === "low" && styles.qualityActive,
              ]}
              onPress={() => setStreamQuality("low")}
            >
              <Text
                style={[
                  styles.qualityButtonText,
                  streamQuality === "low" && styles.qualityButtonActive,
                ]}
              >
                Low
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.qualityButton,
                streamQuality === "medium" && styles.qualityActive,
              ]}
              onPress={() => setStreamQuality("medium")}
            >
              <Text
                style={[
                  styles.qualityButtonText,
                  streamQuality === "medium" && styles.qualityButtonActive,
                ]}
              >
                Med
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.qualityButton,
                streamQuality === "high" && styles.qualityActive,
              ]}
              onPress={() => setStreamQuality("high")}
            >
              <Text
                style={[
                  styles.qualityButtonText,
                  streamQuality === "high" && styles.qualityButtonActive,
                ]}
              >
                High
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.selectorContainer}>
        <TouchableOpacity
          style={[
            styles.selectorButton,
            currentMode === "local" && styles.selectorActive,
          ]}
          onPress={() => handleModeSwitch("local")}
        >
          <Text
            style={[
              styles.selectorText,
              currentMode === "local" && styles.selectorTextActive,
            ]}
          >
            Local
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.selectorButton,
            currentMode === "relay" && styles.selectorActive,
          ]}
          onPress={() => handleModeSwitch("relay")}
        >
          <Text
            style={[
              styles.selectorText,
              currentMode === "relay" && styles.selectorTextActive,
            ]}
          >
            Relay
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.stat}>💨 Gas Level:</Text>
          <Text
            style={[
              styles.value,
              typeof readings.gasValue === "number" &&
                readings.gasValue > 1000 &&
                styles.alert,
            ]}
          >
            {readings.gasValue}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.stat}>🔥 Flame Detected:</Text>
          <Text
            style={[styles.value, readings.isFlameDetected && styles.alert]}
          >
            {readings.isFlameDetected ? "YES" : "No"}
          </Text>
        </View>
        <View style={[styles.row, styles.criticalRow]}>
          <Text style={styles.stat}>🚨 Critical Alert:</Text>
          <Text
            style={[styles.value, readings.isCriticalAlert && styles.alert]}
          >
            {readings.isCriticalAlert ? "ACTIVE" : "Inactive"}
          </Text>
        </View>
        <Text style={styles.lastUpdate}>Last update: {lastUpdateDate}</Text>
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---
const { width } = Dimensions.get("window");
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4));

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#F3F4F6" },
  videoWrap: {
    height: VIDEO_HEIGHT,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    width: "100%",
  },
  loadingText: { marginTop: 8, color: "#9CA3AF" },
  offline: {
    flex: 1,
    width: "100%",
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  offlineText: {
    color: "#F9FAFB",
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },
  errorText: { marginTop: 8, color: "#F3F4F6", textAlign: "center" },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginTop: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  criticalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    marginTop: 4,
  },
  stat: { fontSize: 16, color: "#374151", fontWeight: "500" },
  value: { fontSize: 16, fontWeight: "700", color: "#111827" },
  alert: { color: "#DC2626" },
  lastUpdate: {
    marginTop: 8,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 13,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
  },
  selectorContainer: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    padding: 4,
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  selectorActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  selectorText: { fontSize: 16, fontWeight: "600", color: "#4B5563" },
  selectorTextActive: { color: "#1F2937" },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#3B82F6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  performanceOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 8,
    borderRadius: 6,
    minWidth: 120,
  },
  performanceText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  performanceToggle: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 8,
    borderRadius: 6,
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  performanceToggleText: {
    fontSize: 16,
  },
  qualitySelector: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qualityLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  qualityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  qualityActive: {
    backgroundColor: "#3B82F6",
  },
  qualityButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  qualityButtonActive: {
    color: "#FFFFFF",
  },
});
