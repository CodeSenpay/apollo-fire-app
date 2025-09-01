import React, { JSX, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { subscribeToDevice, DeviceData as FirebaseDeviceData, requestStream } from '../src/services/firebaseConfig' // adjust path if needed

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

export default function CameraScreen(): JSX.Element {
  const [checking, setChecking] = useState(false)
  const [serverOk, setServerOk] = useState(false)
  const [streamActive, setStreamActive] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [readings, setReadings] = useState<Readings>({
    temperature: 'N/A',
    gasValue: 'N/A',
    isFlameDetected: 'N/A',
    isCriticalAlert: 'N/A',
    lastUpdate: 'N/A',
  })
  const [attemptCount, setAttemptCount] = useState(0)
  const [waitingManual, setWaitingManual] = useState(false)

  const mountedRef = useRef(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firebaseUnsubRef = useRef<() => void | null>(null)

  useEffect(() => {
    mountedRef.current = true

    // subscribe to Firebase readings right away
    const firebaseUnsub = subscribeToDevice(DEVICE_ID, (data: FirebaseDeviceData | null) => {
      if (!mountedRef.current) return
      if (!data) {
        // keep placeholders when DB has no readings
        setReadings({
          temperature: 'N/A',
          gasValue: 'N/A',
          isFlameDetected: 'N/A',
          isCriticalAlert: 'N/A',
          lastUpdate: 'N/A',
        })
        return
      }
      // map numeric booleans to boolean
      setReadings({
        temperature: typeof data.temperature === 'number' ? data.temperature : 'N/A',
        gasValue: typeof data.gasValue === 'number' ? data.gasValue : 'N/A',
        isFlameDetected: data.isFlameDetected === 1,
        isCriticalAlert: data.isCriticalAlert === 1,
        lastUpdate: typeof data.lastUpdate === 'number' ? data.lastUpdate : 'N/A',
      })
    })
    firebaseUnsubRef.current = firebaseUnsub

    // start initial relay connect attempts
    attemptConnectWithRetries()

    return () => {
      mountedRef.current = false
      stopContinuousPolling()
      if (firebaseUnsubRef.current) firebaseUnsubRef.current()
    }
  }, [])

  async function fetchWithTimeout(url: string) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    try {
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(id)
      return res
    } catch (err) {
      clearTimeout(id)
      throw err
    }
  }

  async function attemptConnectWithRetries() {
    setWaitingManual(false)
    setAttemptCount(0)
    setLastError(null)
    setChecking(true)

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (!mountedRef.current) return
      setAttemptCount(attempt)
      try {
        const rootRes = await fetchWithTimeout(`${RELAY_BASE}/`)
        if (!rootRes.ok) throw new Error(`health ${rootRes.status}`)

        const streamUrl = `${RELAY_BASE}/stream/view/${DEVICE_ID}`
        const streamRes = await fetchWithTimeout(streamUrl)
        if (!streamRes.ok) throw new Error(`stream ${streamRes.status}`)

        if (!mountedRef.current) return
        setServerOk(true)
        setStreamActive(true)
        setLastError(null)
        setChecking(false)

        startContinuousPolling()
        return
      } catch (err: any) {
        if (!mountedRef.current) return
        setLastError(err?.message ?? 'network error')
        if (attempt < MAX_RETRIES) {
          await new Promise(res => setTimeout(res, RETRY_DELAY_MS))
        }
      }
    }

    if (!mountedRef.current) return
    setChecking(false)
    setServerOk(false)
    setStreamActive(false)
    setWaitingManual(true)
  }

  function startContinuousPolling() {
    stopContinuousPolling()
    pollRef.current = setInterval(() => {
      checkServerAndStream().catch(() => {})
    }, POLL_INTERVAL)
    checkServerAndStream().catch(() => {})
  }

  function stopContinuousPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function checkServerAndStream() {
    if (!mountedRef.current) return
    setChecking(true)
    setLastError(null)
    try {
      const rootRes = await fetchWithTimeout(`${RELAY_BASE}/`)
      if (!rootRes.ok) throw new Error(`health ${rootRes.status}`)
      setServerOk(true)

      const streamUrl = `${RELAY_BASE}/stream/view/${DEVICE_ID}`
      const streamRes = await fetchWithTimeout(streamUrl)
      if (!streamRes.ok) {
        setStreamActive(false)
        setLastError(`stream ${streamRes.status}`)
      } else {
        setStreamActive(true)
      }
    } catch (err: any) {
      setServerOk(false)
      setStreamActive(false)
      setLastError(err?.message ?? 'network error')
      stopContinuousPolling()
      setWaitingManual(true)
    } finally {
      if (mountedRef.current) setChecking(false)
    }
  }

async function handleManualStart() {
  try {
    setLastError(null)
    setAttemptCount(0)
    setWaitingManual(false)

    // request ESP32 to start streaming
    await requestStream(DEVICE_ID, true)

    // then start relay connect attempts
    attemptConnectWithRetries().catch(() => {})
  } catch (err:any) {
    setLastError(err?.message ?? 'request failed')
    setWaitingManual(true)
  }
}

// optional stop
async function handleManualStop() {
  await requestStream(DEVICE_ID, false)
  stopContinuousPolling()
  setStreamActive(false)
  setServerOk(false)
  setWaitingManual(true)
}

  const streamUrl = `${RELAY_BASE}/stream/view/${DEVICE_ID}`

  function renderStream() {
    const html = `
      <html>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh}img{max-width:100%;max-height:100%;object-fit:contain}</style>
        <body><img src="${streamUrl}" alt="mjpeg-stream" /></body>
      </html>
    `
    return (
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled={false}
        onError={() => {
          setStreamActive(false)
          setLastError('stream load error')
          stopContinuousPolling()
          setWaitingManual(true)
        }}
        onHttpError={(e) => {
          setStreamActive(false)
          setLastError(`http ${e.nativeEvent.statusCode}`)
          stopContinuousPolling()
          setWaitingManual(true)
        }}
      />
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Apollo Fire Device</Text>

      <View style={styles.videoWrap}>
        {checking && !serverOk ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>
              Connecting
              {attemptCount > 0 ? `  attempt ${attemptCount} of ${MAX_RETRIES}` : ''}
            </Text>
          </View>
        ) : serverOk && streamActive ? (
          renderStream()
        ) : waitingManual ? (
          <View style={styles.offline}>
            <Text style={styles.offlineText}>STREAM OFFLINE</Text>
            {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
            <TouchableOpacity style={styles.startButton} onPress={handleManualStart}>
              <Text style={styles.buttonText}>Start</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.offline}>
            <Text style={styles.offlineText}>STREAM OFFLINE</Text>
            {lastError ? <Text style={styles.errorText}>{lastError}</Text> : null}
            <TouchableOpacity style={styles.startButton} onPress={handleManualStart}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.stat}>🌡️ Temperature</Text>
          <Text style={styles.value}>{readings.temperature}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.stat}>💨 Gas Value</Text>
          <Text style={styles.value}>{readings.gasValue}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.stat}>🔥 Flame Detected</Text>
          <Text style={styles.value}>
            {readings.isFlameDetected === 'N/A' ? 'N/A' : readings.isFlameDetected ? 'Yes' : 'No'}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.stat}>🚨 Critical Alert</Text>
          <Text style={[styles.value, readings.isCriticalAlert === true ? styles.alert : null]}>
            {readings.isCriticalAlert === 'N/A' ? 'N/A' : readings.isCriticalAlert ? 'Yes' : 'No'}
          </Text>
        </View>

        <Text style={styles.lastUpdate}>
          ⏱️ Last Update:
          {' '}
          {readings.lastUpdate === 'N/A' ? 'N/A' : new Date(Number(readings.lastUpdate)).toLocaleString()}
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={checkServerAndStream}>
            <Text style={styles.buttonText}>Manual Check</Text>
          </TouchableOpacity>
        </View>
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
