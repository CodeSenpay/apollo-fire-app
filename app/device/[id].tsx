import {
  getRelayStreamUrl,
  getServoState,
  getUserDevices,
  requestStream,
  setServoPosition
} from "@/src/services/apiConfig";
import {
  connectSocket,
  emitServoCommand,
  subscribeToDevice,
  unsubscribeFromDevice,
} from "@/src/state/socket";
import { logStreamError } from "@/src/utils/logger";
import { Ionicons } from "@expo/vector-icons";
import { Link, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ImageStyle } from "react-native";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";

const STREAM_RETRY_INTERVAL_MS = 5000;
const STREAM_RETRY_IDLE_BACKOFF_MS = 15000;
const MAX_STREAM_RETRY_ATTEMPTS = 60;
const MONITOR_INTERVAL = 1000;
const PERFORMANCE_SAMPLE_WINDOW_MS = 5000;
const STREAM_REFRESH_INTERVAL_MS = 30000;
const SERVO_REST_FALLBACK_DELAY_MS = 120;
const SERVO_HOLD_INTERVAL_MS = 80;
const SERVO_STEP_DEGREES = 3;
const SERVO_PERSIST_THROTTLE_MS = 500;
const SERVO_PAN_MAX_DEGREES = 180;
const SERVO_TILT_MAX_DEGREES = 140;
const SERVO_DEBUG_TAG = "[ServoClient]";
const DEVICE_OFFLINE_MESSAGE = "Device is offline or stream unavailable.";
const SUPPORTED_STREAM_PROTOCOLS = ["http://", "https://", "ws://", "wss://"] as const;

const logServoClient = (...args: unknown[]) => {
  console.log(SERVO_DEBUG_TAG, ...args);
};

const clampServoValue = (axis: "pan" | "tilt", value: number) => {
  const max = axis === "pan" ? SERVO_PAN_MAX_DEGREES : SERVO_TILT_MAX_DEGREES;
  return Math.min(max, Math.max(0, value));
};

const isSupportedStreamProtocol = (url: string | null | undefined) => {
  if (!url) {
    return false;
  }
  return SUPPORTED_STREAM_PROTOCOLS.some((protocol) => url.startsWith(protocol));
};

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
// --- Main Component ---
// Replace the existing DeviceDetailScreen component with this version
export default function DeviceDetailScreen() {
  const { id: deviceId, name: initialNameParam } =
    useLocalSearchParams<{ id: string; name?: string }>();
  const navigation = useNavigation();
  const ws = useRef<WebSocket | null>(null);
  const loadTarget = useRef<"A" | "B">("B");
  const streamRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const streamRetryAttempts = useRef(0);
  const currentModeRef = useRef<"local" | "relay">("local");

  // double buffer state for rendering
  const [frameA, setFrameA] = useState<string | null>(null);
  const [frameB, setFrameB] = useState<string | null>(null);
  const [activeFrame, setActiveFrame] = useState<"A" | "B">("A");

  // other state
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [streamConnectEpoch, setStreamConnectEpoch] = useState(0);
  const [currentMode, setCurrentMode] = useState<"local" | "relay">("local");
  const [showPerformance, setShowPerformance] = useState(false);
  const [streamQuality, setStreamQuality] = useState<"low" | "medium" | "high">(
    "medium"
  );
  const [panAngle, setPanAngle] = useState<number | null>(null);
  const [tiltAngle, setTiltAngle] = useState<number | null>(null);
  const [servoSequence, setServoSequence] = useState<number>(0);
  const servoBusyRef = useRef(false);
  const [servoBusy, setServoBusy] = useState(false);
  const servoHoldActiveRef = useRef(false);
  const persistThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(() => {
    if (typeof initialNameParam === "string" && initialNameParam.trim()) {
      return initialNameParam.trim();
    }
    return null;
  });

  const [orientation, setOrientation] = useState<{
    rotation: 0 | 90 | 180 | 270;
    flipHorizontal: boolean;
    flipVertical: boolean;
  }>({ rotation: 0, flipHorizontal: false, flipVertical: false });
  const [servoControlTab, setServoControlTab] = useState<
    "panTilt" | "orientation"
  >("panTilt");

  const orientationTransforms = useMemo(() => {
    const transforms: any[] = [];
    if (orientation.rotation !== 0) {
      transforms.push({ rotate: `${orientation.rotation}deg` });
    }
    if (orientation.flipHorizontal) {
      transforms.push({ scaleX: -1 });
    }
    if (orientation.flipVertical) {
      transforms.push({ scaleY: -1 });
    }
    return transforms;
  }, [orientation]);

  const orientationStyle = useMemo<ImageStyle | null>(() => {
    if (orientationTransforms.length === 0) {
      return null;
    }
    return { transform: orientationTransforms };
  }, [orientationTransforms]);

  const panAngleRef = useRef<number>(90);
  const tiltAngleRef = useRef<number>(90);

  useEffect(() => {
    if (!deviceId) return;

    let cancelled = false;

    const loadServoState = async () => {
      try {
        const state = await getServoState(deviceId);
        if (!state || cancelled) {
          return;
        }

        const { pan, tilt } = state;

        if (typeof pan === "number") {
          const clampedPan = clampServoValue("pan", pan);
          panAngleRef.current = clampedPan;
          setPanAngle(clampedPan);
        }

        if (typeof tilt === "number") {
          const clampedTilt = clampServoValue("tilt", tilt);
          tiltAngleRef.current = clampedTilt;
          setTiltAngle(clampedTilt);
        }
      } catch (error) {
        logStreamError("Failed to load servo state", error);
      }
    };

    loadServoState();

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const httpPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStreamRetryTimer = useCallback(() => {
    if (streamRetryTimeoutRef.current) {
      clearTimeout(streamRetryTimeoutRef.current);
      streamRetryTimeoutRef.current = null;
    }
  }, []);

  const resetStreamRetryState = useCallback(() => {
    streamRetryAttempts.current = 0;
    clearStreamRetryTimer();
  }, [clearStreamRetryTimer]);

  type StreamLoadResult = { success: boolean; retryDelay?: number };

  const loadStreamUrl = useCallback(
    async (
      mode: "local" | "relay",
      options?: { silent?: boolean }
    ): Promise<StreamLoadResult> => {
      if (!deviceId) {
        return { success: false, retryDelay: STREAM_RETRY_IDLE_BACKOFF_MS };
      }

      const silent = options?.silent ?? false;
      if (!silent) {
        setIsLoading(true);
      }

      try {
        const dbStreamUrl = await getRelayStreamUrl(deviceId);

        if (dbStreamUrl && isSupportedStreamProtocol(dbStreamUrl)) {
          console.log(`Stream URL from database (${mode} mode):`, dbStreamUrl);
          setStreamUrl(dbStreamUrl);
          setStreamError(null);
          return { success: true };
        }

        if (dbStreamUrl && !isSupportedStreamProtocol(dbStreamUrl)) {
          logStreamError("Unsupported stream protocol received", dbStreamUrl);
        }

        setStreamUrl(null);
        setStreamActive(false);
        setStreamError(DEVICE_OFFLINE_MESSAGE);
        return {
          success: false,
          retryDelay: STREAM_RETRY_IDLE_BACKOFF_MS,
        };
      } catch (error) {
        logStreamError("Error fetching stream URL:", error);
        setStreamUrl(null);
        setStreamActive(false);
        setStreamError(DEVICE_OFFLINE_MESSAGE);
        return { success: false };
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [deviceId, resetStreamRetryState]
  );

  const scheduleStreamRetry = useCallback(
    (delayOverride?: number) => {
      if (!deviceId) {
        return;
      }

      if (streamRetryAttempts.current >= MAX_STREAM_RETRY_ATTEMPTS) {
        setStreamError(DEVICE_OFFLINE_MESSAGE);
        setIsLoading(false);
        clearStreamRetryTimer();
        return;
      }

      const nextAttempt = streamRetryAttempts.current + 1;
      streamRetryAttempts.current = nextAttempt;

      setStreamError(null);
      setIsLoading(true);
      setStreamActive(false);
      setFrameA(null);
      setFrameB(null);
      loadedARef.current = false;
      loadedBRef.current = false;

      const exponentialDelay = Math.min(
        1000 * Math.pow(2, nextAttempt - 1),
        STREAM_RETRY_INTERVAL_MS
      );

      const delay =
        delayOverride !== undefined
          ? delayOverride
          : nextAttempt === 1
          ? 0
          : exponentialDelay;

      clearStreamRetryTimer();

      console.log(
        `[StreamRetry] Attempt ${nextAttempt}/${MAX_STREAM_RETRY_ATTEMPTS} in ${delay}ms`
      );

      streamRetryTimeoutRef.current = setTimeout(() => {
        streamRetryTimeoutRef.current = null;

        requestStream(deviceId, true).catch((error) => {
          logStreamError("Failed to request stream during retry", error);
        });

        loadStreamUrl(currentModeRef.current, { silent: true }).then((result) => {
          if (!result.success) {
            const nextDelay =
              result.retryDelay ?? STREAM_RETRY_INTERVAL_MS;
            scheduleStreamRetry(nextDelay);
          }
        });
      }, delay);
    },
    [
      clearStreamRetryTimer,
      currentModeRef,
      deviceId,
      loadStreamUrl,
      requestStream,
    ]
  );

  const triggerStreamLoad = useCallback(
    (mode: "local" | "relay", options?: { silent?: boolean }) => {
      loadStreamUrl(mode, options).then((result) => {
        if (result.success) {
          setStreamConnectEpoch(Date.now());
          return;
        }

        if (!result.success) {
          const retryDelay = result.retryDelay ?? STREAM_RETRY_INTERVAL_MS;
          scheduleStreamRetry(retryDelay);
        }
      });
    },
    [loadStreamUrl, scheduleStreamRetry]
  );

  const localServoEndpoints = useMemo(() => {
    if (!streamUrl || !streamUrl.startsWith("ws")) {
      return null;
    }
    try {
      const normalizedUrl = streamUrl.replace(/^ws/, "http");
      const url = new URL(normalizedUrl);
      const base = `${url.protocol}//${url.host}`;
      return {
        command: `${base}/servo`,
      };
    } catch (error) {
      logStreamError("Failed to derive local servo endpoint from stream URL", error);
      return null;
    }
  }, [streamUrl]);

  const sendServoCommandLocal = useCallback(
    async (payload: { pan?: number; tilt?: number }) => {
      if (!localServoEndpoints || currentMode !== "local") {
        return false;
      }

      try {
        const body: Record<string, number> = {};
        if (typeof payload.pan === "number") {
          body.pan = payload.pan;
        }
        if (typeof payload.tilt === "number") {
          body.tilt = payload.tilt;
        }

        if (Object.keys(body).length === 0) {
          return false;
        }

        logServoClient("Sending servo command via local HTTP", {
          endpoint: localServoEndpoints.command,
          body,
        });

        const response = await fetch(localServoEndpoints.command, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        logServoClient("Local servo command succeeded", {
          endpoint: localServoEndpoints.command,
          body,
        });
        return true;
      } catch (error) {
        logStreamError("Local servo command failed", error);
        logServoClient("Local servo command failed", {
          endpoint: localServoEndpoints?.command,
          error,
        });
        return false;
      }
    },
    [localServoEndpoints, currentMode]
  );

  const throttledPersist = useCallback(
    async (payload: { pan?: number; tilt?: number }) => {
      if (!deviceId) return;
      
      if (persistThrottleRef.current) {
        clearTimeout(persistThrottleRef.current);
      }
      
      persistThrottleRef.current = setTimeout(async () => {
        try {
          await setServoPosition(deviceId, { ...payload, persistOnly: true });
        } catch (error) {
          logStreamError("Failed to persist servo state to backend", error);
        }
      }, SERVO_PERSIST_THROTTLE_MS);
    },
    [deviceId]
  );

  const sendServoCommand = useCallback(
    async (payload: { pan?: number; tilt?: number }, skipPersist = false) => {
      if (!deviceId) return;

      const success = await sendServoCommandLocal(payload);
      if (success) {
        // Throttle backend persistence for continuous movements
        if (!skipPersist) {
          throttledPersist(payload);
        }
      } else {
        // Fall back to relay/socket command
        emitServoCommand(deviceId, payload);
      }
    },
    [deviceId, sendServoCommandLocal, throttledPersist]
  );

  const handleServoCommand = useCallback(
    async (payload: { pan?: number; tilt?: number }, isHoldMove = false) => {
      // Allow continuous hold movements to bypass busy check
      if (!isHoldMove && servoBusyRef.current) {
        return;
      }

      if (!isHoldMove) {
        servoBusyRef.current = true;
        setServoBusy(true);
      }

      try {
        await sendServoCommand(payload, isHoldMove);
      } finally {
        if (!isHoldMove) {
          servoRestTimeoutRef.current = setTimeout(() => {
            servoBusyRef.current = false;
            setServoBusy(false);
          }, SERVO_REST_FALLBACK_DELAY_MS);
        }
      }
    },
    [sendServoCommand]
  );

  const scheduleServoMove = useCallback(
    (payload: { pan?: number; tilt?: number }) => {
      const nextPayload: { pan?: number; tilt?: number } = {};
      const { pan, tilt } = payload;

      if (typeof pan === "number") {
        const clampedPan = clampServoValue("pan", pan);
        panAngleRef.current = clampedPan;
        setPanAngle(clampedPan);
        nextPayload.pan = clampedPan;
      }

      if (typeof tilt === "number") {
        const clampedTilt = clampServoValue("tilt", tilt);
        tiltAngleRef.current = clampedTilt;
        setTiltAngle(clampedTilt);
        nextPayload.tilt = clampedTilt;
      }

      if (!("pan" in nextPayload) && !("tilt" in nextPayload)) {
        return;
      }

      // Mark as hold move for smooth continuous operation
      handleServoCommand(nextPayload, servoHoldActiveRef.current);
    },
    [handleServoCommand]
  );

  const startServoHold = useCallback(
    (axis: "pan" | "tilt", delta: number) => {
      if (servoHoldParamsRef.current) {
        return;
      }

      servoHoldActiveRef.current = true;
      servoHoldParamsRef.current = { axis, delta };

      const initialPayload =
        axis === "pan"
          ? { pan: (panAngleRef.current ?? 90) + delta }
          : { tilt: (tiltAngleRef.current ?? 90) + delta };

      scheduleServoMove(initialPayload);

      servoHoldIntervalRef.current = setInterval(() => {
        const params = servoHoldParamsRef.current;
        if (!params) {
          return;
        }

        const livePan = panAngleRef.current ?? 90;
        const liveTilt = tiltAngleRef.current ?? 90;

        const nextPayload =
          params.axis === "pan"
            ? { pan: livePan + params.delta }
            : { tilt: liveTilt + params.delta };

        scheduleServoMove(nextPayload);
      }, SERVO_HOLD_INTERVAL_MS);
    },
    [scheduleServoMove]
  );

  const stopServoHold = useCallback(() => {
    servoHoldActiveRef.current = false;
    servoHoldParamsRef.current = null;
    if (servoHoldIntervalRef.current) {
      clearInterval(servoHoldIntervalRef.current);
      servoHoldIntervalRef.current = null;
    }
    
    // Force final persist after hold ends
    if (persistThrottleRef.current) {
      clearTimeout(persistThrottleRef.current);
      const finalPayload = {
        pan: panAngleRef.current,
        tilt: tiltAngleRef.current,
      };
      if (deviceId) {
        setServoPosition(deviceId, { ...finalPayload, persistOnly: true }).catch((error) =>
          logStreamError("Failed to persist final servo state", error)
        );
      }
    }
  }, [deviceId]);

  const handleRecenter = useCallback(async () => {
    if (!deviceId || servoBusyRef.current) return;

    servoBusyRef.current = true;
    setServoBusy(true);

    try {
      // Reset to center position
      const centerPayload = { pan: 90, tilt: 90 };
      
      // Update local state immediately for UI responsiveness
      panAngleRef.current = 90;
      tiltAngleRef.current = 90;
      setPanAngle(90);
      setTiltAngle(90);

      // Send command to device
      await sendServoCommand(centerPayload);
    } finally {
      servoRestTimeoutRef.current = setTimeout(() => {
        servoBusyRef.current = false;
        setServoBusy(false);
      }, SERVO_REST_FALLBACK_DELAY_MS);
    }
  }, [deviceId, sendServoCommand]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const refreshDeviceName = async () => {
        if (!deviceId) {
          return;
        }

        try {
          const devices = await getUserDevices();
          if (!isActive) {
            return;
          }

          const match = devices.find((device) => device.id === deviceId);
          const normalizedName = match?.name?.trim();
          setDeviceName(normalizedName || null);
        } catch (error) {
          console.warn("Failed to refresh device name", error);
        }
      };

      refreshDeviceName();

      return () => {
        isActive = false;
      };
    }, [deviceId])
  );

  useEffect(() => {
    if (!deviceId) {
      return;
    }

    const shortId = deviceId.length > 12 ? `${deviceId.slice(0, 12)}...` : deviceId;
    const displayName = deviceName?.trim() || shortId;

    navigation.setOptions({
      title: `Device: ${displayName}`,
      headerRight: () => (
        <Link href={{ pathname: "/device/settings", params: { id: deviceId } }} asChild>
          <Pressable style={{ marginRight: 15 }}>
            <Ionicons name="settings-outline" size={24} color="#1F2937" />
          </Pressable>
        </Link>
      ),
    });
  }, [navigation, deviceId, deviceName]);

  useEffect(() => {
    if (!deviceId) return;

    requestStream(deviceId, true);
    triggerStreamLoad(currentModeRef.current);

    return () => {
      clearStreamRetryTimer();
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
  }, [clearStreamRetryTimer, deviceId, triggerStreamLoad]);

  useEffect(() => {
    if (!deviceId) {
      return;
    }
    currentModeRef.current = currentMode;
    triggerStreamLoad(currentMode, { silent: true });
  }, [currentMode, deviceId, triggerStreamLoad]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;

    const attachSocket = async () => {
      await connectSocket();
      if (cancelled) return;
      subscribeToDevice(deviceId, {
        streamMode: ({ mode }) => {
          setCurrentMode(mode);
        },
        streamUrl: ({ streamUrl: nextUrl }) => {
          setStreamUrl(nextUrl || null);
          setIsLoading(false);
        },
        streamStatus: ({ status }) => {
          const isActive = status === "active";
          setStreamActive(isActive);
          if (isActive) {
            setStreamError(null);
          }
        },
        mlAlert: (payload) => {
          console.log("Realtime ML alert", payload);
        },
        servo: ({ pan, tilt, sequence }) => {
          if (sequence >= servoSequence) {
            setServoSequence(sequence);
            if (typeof pan === "number") {
              const clampedPan = clampServoValue("pan", pan);
              panAngleRef.current = clampedPan;
              setPanAngle(clampedPan);
            }
            if (typeof tilt === "number") {
              const clampedTilt = clampServoValue("tilt", tilt);
              tiltAngleRef.current = clampedTilt;
              setTiltAngle(clampedTilt);
            }
          }
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
  const lastFrameTimeRef = useRef<number>(0);
  const performanceRef = useRef({ droppedFrames: 0, totalFrames: 0 });
  const servoRestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const servoHoldIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const servoHoldParamsRef = useRef<{ axis: "pan" | "tilt"; delta: number } | null>(null);
  const latestServoCommandRef = useRef<{ pan?: number; tilt?: number }>({});
  const messageQueueRef = useRef<ArrayBuffer[]>([]);
  const processingMessageRef = useRef(false);
  const lastProcessedMessageRef = useRef<number>(0);
  const maxQueueSize = 5; // Larger buffer for smoother playback
  const frameProcessingTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  // Message throttling and backpressure handling
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
        logStreamError("Error processing frame:", error);
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

  useEffect(() => {
    if (!streamUrl || !isSupportedStreamProtocol(streamUrl)) {
      ws.current?.close();
      setStreamActive(false);
      setStreamError((prev) => prev ?? DEVICE_OFFLINE_MESSAGE);
      setIsLoading(false);
      scheduleStreamRetry(STREAM_RETRY_IDLE_BACKOFF_MS);
      return;
    }

    // Clean up existing connection and reconnect timeout
    if (ws.current) {
      ws.current.close();
    }
    clearStreamRetryTimer();

    let wsUrl: string;
    if (currentMode === "local") {
      // Clean up the URL and ensure proper WebSocket format
      if (streamUrl.startsWith("ws://") || streamUrl.startsWith("wss://")) {
        wsUrl = streamUrl;
      } else {
        // Convert HTTP to WS and normalize the URL
        wsUrl = streamUrl
          .replace("http://", "ws://")
          .replace("https://", "wss://")
          .replace("/stream", "/ws");
        
        // Remove explicit :80 port for ws:// (WebSocket default)
        wsUrl = wsUrl.replace(":80/", "/");
      }
    } else {
      // For relay mode, use the stream URL directly (could be WebSocket or HTTP)
      wsUrl = streamUrl;
    }
    
    console.log("[WebSocket] Connecting to:", wsUrl);

    // Only create WebSocket for local mode or if URL is WebSocket
    if (
      currentMode === "local" ||
      wsUrl.startsWith("ws://") ||
      wsUrl.startsWith("wss://")
    ) {
      console.log("[WebSocket] Creating connection to:", wsUrl);
      
      try {
        ws.current = new WebSocket(wsUrl);
        ws.current.binaryType = "arraybuffer";
        console.log("[WebSocket] Instance created, waiting for connection...");
      } catch (error) {
        logStreamError("[WebSocket] Failed to create instance:", error);
        setStreamError(DEVICE_OFFLINE_MESSAGE);
        setIsLoading(false);
        return;
      }

      ws.current.onopen = () => {
        console.log("[WebSocket] CONNECTED! Ready to receive frames");
        setIsLoading(false);
        setStreamError(null);
        resetStreamRetryState();
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
        logStreamError("[WebSocket] ERROR:", error);
        setStreamError(DEVICE_OFFLINE_MESSAGE);
        scheduleStreamRetry();
      };

      ws.current.onclose = (event) => {
        console.log("[WebSocket] CLOSED:", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          url: wsUrl
        });
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
          setStreamError(DEVICE_OFFLINE_MESSAGE);
          scheduleStreamRetry();
          return;
        }

        if (streamRetryAttempts.current > 0) {
          // Closure during ongoing retry sequence; attempt again
          scheduleStreamRetry();
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
          logStreamError("Error queuing frame:", error);
          performanceRef.current.droppedFrames++;
        }
      };
    } else {
      // For HTTP relay streams - implement simple image polling
      setIsLoading(false);
      setStreamError(null);
      resetStreamRetryState();

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
              logStreamError("HTTP polling failed:", response.status);
            }
          } catch (error) {
            logStreamError("HTTP polling error:", error);
            setStreamError(DEVICE_OFFLINE_MESSAGE);
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
      clearStreamRetryTimer();
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
  }, [streamUrl, currentMode, streamConnectEpoch]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Connecting to stream...</Text>
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
            onPress={() => triggerStreamLoad(currentMode)}
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
          <Text style={styles.errorText}>Stream not available</Text>
        </View>
      );
    }

    return (
      <View style={styles.streamContainer}>
        <Image
          source={frameA ? { uri: frameA } : undefined}
          style={[
            StyleSheet.absoluteFill,
            orientationStyle,
            { opacity: activeFrame === "A" ? 1 : 0 },
          ]}
          fadeDuration={0}
          resizeMode="contain"
          onLoadEnd={() => {
            loadedARef.current = true;
            if (bufferARef.current && bufferARef.current === frameA) {
              scheduleSwapIfReady("A");
            }
          }}
          onError={(error) => {
            console.error("Image load error for frame A:", error);
            loadedARef.current = false;
          }}
        />
        <Image
          source={frameB ? { uri: frameB } : undefined}
          style={[
            StyleSheet.absoluteFill,
            orientationStyle,
            { opacity: activeFrame === "B" ? 1 : 0 },
          ]}
          fadeDuration={0}
          resizeMode="contain"
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
        />
      </View>
    );
  };

  if (!deviceId)
    return (
      <SafeAreaView style={styles.container}>
        <Text>No Device ID.</Text>
      </SafeAreaView>
    );

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
      <View style={styles.servoTabContainer}>
        <TouchableOpacity
          style={
            servoControlTab === "panTilt"
              ? styles.servoTabButtonActive
              : styles.servoTabButton
          }
          onPress={() => setServoControlTab("panTilt")}
        >
          <Text
            style={
              servoControlTab === "panTilt"
                ? styles.servoTabTextActive
                : styles.servoTabText
            }
          >
            Pan & Tilt
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={
            servoControlTab === "orientation"
              ? styles.servoTabButtonActive
              : styles.servoTabButton
          }
          onPress={() => setServoControlTab("orientation")}
        >
          <Text
            style={
              servoControlTab === "orientation"
                ? styles.servoTabTextActive
                : styles.servoTabText
            }
          >
            Orientation
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.servoCard}>
        <Text style={styles.servoTitle}>
          {servoControlTab === "orientation"
            ? "Orientation Controls"
            : "Pan / Tilt Control"}
        </Text>

        {servoControlTab === "orientation" ? (
          <View style={styles.servoOrientationSection}>
            <View style={styles.orientationRow}>
              {[0, 90, 180, 270].map((angle) => (
                <TouchableOpacity
                  key={angle}
                  style={
                    orientation.rotation === angle
                      ? styles.orientationButtonActive
                      : styles.orientationButton
                  }
                  onPress={() =>
                    setOrientation((prev) => ({
                      ...prev,
                      rotation: angle as 0 | 90 | 180 | 270,
                    }))
                  }
                >
                  <Text
                    style={
                      orientation.rotation === angle
                        ? styles.orientationButtonTextActive
                        : styles.orientationButtonText
                    }
                  >
                    {angle}°
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.orientationRow}>
              <TouchableOpacity
                style={
                  orientation.flipHorizontal
                    ? styles.orientationButtonActive
                    : styles.orientationButton
                }
                onPress={() =>
                  setOrientation((prev) => ({
                    ...prev,
                    flipHorizontal: !prev.flipHorizontal,
                  }))
                }
              >
                <Text
                  style={
                    orientation.flipHorizontal
                      ? styles.orientationButtonTextActive
                      : styles.orientationButtonText
                  }
                >
                  Flip X
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={
                  orientation.flipVertical
                    ? styles.orientationButtonActive
                    : styles.orientationButton
                }
                onPress={() =>
                  setOrientation((prev) => ({
                    ...prev,
                    flipVertical: !prev.flipVertical,
                  }))
                }
              >
                <Text
                  style={
                    orientation.flipVertical
                      ? styles.orientationButtonTextActive
                      : styles.orientationButtonText
                  }
                >
                  Flip Y
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.orientationReset}
                onPress={() =>
                  setOrientation({
                    rotation: 0,
                    flipHorizontal: false,
                    flipVertical: false,
                  })
                }
              >
                <Text style={styles.orientationResetText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.servoCircularWrapper}>
              <View style={styles.servoCircle}>
                <TouchableOpacity
                  style={[
                    styles.servoDirectionalButton,
                    styles.servoButtonTop,
                    servoBusy && styles.servoButtonDisabled,
                  ]}
                  onPressIn={() => startServoHold("tilt", -SERVO_STEP_DEGREES)}
                  onPressOut={stopServoHold}
                  disabled={servoBusy && !servoHoldParamsRef.current}
                >
                  <Ionicons name="chevron-up" size={24} color="#F9FAFB" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.servoDirectionalButton,
                    styles.servoButtonBottom,
                    servoBusy && styles.servoButtonDisabled,
                  ]}
                  onPressIn={() => startServoHold("tilt", SERVO_STEP_DEGREES)}
                  onPressOut={stopServoHold}
                  disabled={servoBusy && !servoHoldParamsRef.current}
                >
                  <Ionicons name="chevron-down" size={24} color="#F9FAFB" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.servoDirectionalButton,
                    styles.servoButtonLeft,
                    servoBusy && styles.servoButtonDisabled,
                  ]}
                  onPressIn={() => startServoHold("pan", -SERVO_STEP_DEGREES)}
                  onPressOut={stopServoHold}
                  disabled={servoBusy && !servoHoldParamsRef.current}
                >
                  <Ionicons name="chevron-back" size={24} color="#F9FAFB" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.servoDirectionalButton,
                    styles.servoButtonRight,
                    servoBusy && styles.servoButtonDisabled,
                  ]}
                  onPressIn={() => startServoHold("pan", SERVO_STEP_DEGREES)}
                  onPressOut={stopServoHold}
                  disabled={servoBusy && !servoHoldParamsRef.current}
                >
                  <Ionicons name="chevron-forward" size={24} color="#F9FAFB" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.servoReadoutRow}>
              <Text style={styles.servoReadout}>Pan: {Math.round(panAngle ?? 90)}°</Text>
              <Text style={styles.servoReadout}>Tilt: {Math.round(tiltAngle ?? 90)}°</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.recenterButton,
                servoBusy && styles.recenterButtonDisabled,
              ]}
              onPress={handleRecenter}
              disabled={servoBusy}
            >
              <Ionicons name="locate" size={18} color="#FFFFFF" />
              <Text style={styles.recenterButtonText}>Recenter</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

// --- Styles ---
const { width } = Dimensions.get("window");
const VIDEO_HEIGHT = Math.round((width - 32) * (3 / 4));

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  streamBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 12,
    marginLeft: 12,
  },
  streamBadgeActive: {
    backgroundColor: "rgba(34,197,94,0.15)",
  },
  streamBadgeInactive: {
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  streamBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
  },
  streamBadgeTextActive: {
    color: "#15803d",
  },
  streamBadgeTextInactive: {
    color: "#b91c1c",
  },
  servoNotice: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: "rgba(254,215,170,0.85)",
    borderRadius: 12,
    padding: 12,
  },
  servoNoticeText: {
    color: "#9a3412",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  videoWrap: {
    height: VIDEO_HEIGHT,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  streamContainer: {
    flex: 1,
  },
  servoOrientationSection: {
    alignSelf: "flex-start",
    width: "100%",
    marginBottom: 16,
  },
  servoOrientationTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  orientationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 8,
  },
  orientationButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
  },
  orientationButtonActive: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: "#3B82F6",
    alignItems: "center",
  },
  orientationButtonText: {
    color: "#1F2937",
    fontSize: 13,
    fontWeight: "600",
  },
  orientationButtonTextActive: {
    color: "#F9FAFB",
    fontSize: 13,
    fontWeight: "700",
  },
  orientationReset: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#E5E7EB",
  },
  orientationResetText: {
    color: "#1F2937",
    fontSize: 13,
    fontWeight: "600",
  },
  frameContainer: {
    flex: 1,
    flexDirection: "row",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  frameWrapper: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  frameActive: {
    opacity: 1,
  },
  frameImage: {
    width: "100%",
    height: "100%",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  servoCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  servoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  servoTabContainer: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  servoTabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  servoTabButtonActive: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  servoTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
  },
  servoTabTextActive: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  servoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  servoLabel: {
    width: 48,
    fontSize: 16,
    color: "#4B5563",
    fontWeight: "600",
  },
  servoCircularWrapper: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  servoCircle: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "#1F2937",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  servoDirectionalButton: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
  },
  servoButtonTop: {
    top: 10,
    left: "50%",
    marginLeft: -28,
  },
  servoButtonBottom: {
    bottom: 10,
    left: "50%",
    marginLeft: -28,
  },
  servoButtonLeft: {
    left: 10,
    top: "50%",
    marginTop: -28,
  },
  servoButtonRight: {
    right: 10,
    top: "50%",
    marginTop: -28,
  },
  servoCenterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  servoButtonDisabled: {
    opacity: 0.5,
  },
  servoReadoutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  servoReadout: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F2937",
  },
  recenterButton: {
    marginTop: 12,
    alignSelf: "center",
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recenterButtonDisabled: {
    backgroundColor: "#93C5FD",
  },
  recenterButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
