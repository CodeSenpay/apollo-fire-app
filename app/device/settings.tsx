// app/device/settings.tsx
import {
  resetDevice,
  getUserData,
  getDeviceDetails,
  getUserDevices,
  renameDevice,
  setStreamMode,
} from '@/src/services/apiConfig';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export default function DeviceSettingsScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [resetting, setResetting] = useState(false);
  const [streamMode, setStreamModeState] = useState<'local' | 'relay'>('local');
  const [modeLoading, setModeLoading] = useState(true);
  const [modeSaving, setModeSaving] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!deviceId) {
      setModeLoading(false);
      return;
    }

    const loadDeviceSettings = async () => {
      setModeLoading(true);
      try {
        const [details, userDevices] = await Promise.allSettled([
          getDeviceDetails(deviceId),
          getUserDevices(),
        ]);

        if (isMounted && details.status === 'fulfilled') {
          const mode = details.value?.streamMode;
          if (mode === 'local' || mode === 'relay') {
            setStreamModeState(mode);
          }
        }

        if (isMounted && userDevices.status === 'fulfilled') {
          const target = userDevices.value.find((device) => device.id === deviceId);
          if (target) {
            setDeviceName(target.name);
            setNameInput(target.name);
          }
        }

        if (isMounted && userDevices.status === 'rejected' && details.status === 'rejected') {
          console.warn('Failed to load device settings metadata');
        }
      } catch (error) {
        console.warn('Failed to load device details for settings', error);
      } finally {
        if (isMounted) {
          setModeLoading(false);
        }
      }
    };

    loadDeviceSettings();

    return () => {
      isMounted = false;
    };
  }, [deviceId]);

  const isNameDirty = useMemo(() => {
    return nameInput.trim() !== deviceName.trim();
  }, [deviceName, nameInput]);

  const handleNameSave = async () => {
    if (!deviceId || nameSaving || !nameInput.trim()) {
      return;
    }

    setNameSaving(true);
    try {
      await renameDevice(deviceId, nameInput.trim());
      setDeviceName(nameInput.trim());
      Alert.alert('Device Renamed', 'Your device name has been updated.');
    } catch (error) {
      console.error('Failed to rename device', error);
      Alert.alert('Error', 'Unable to rename device right now. Please try again.');
    } finally {
      setNameSaving(false);
    }
  };

  const handleModeChange = async (mode: 'local' | 'relay') => {
    if (!deviceId || streamMode === mode || modeSaving) {
      return;
    }

    setModeSaving(true);
    try {
      await setStreamMode(deviceId, mode);
      setStreamModeState(mode);
      Alert.alert('Stream Mode Updated', `Device is now set to ${mode.toUpperCase()} mode.`);
    } catch (error) {
      console.error('Failed to update stream mode', error);
      Alert.alert('Error', 'Unable to update stream mode right now. Please try again.');
    } finally {
      setModeSaving(false);
    }
  };

  const handleResetPress = () => {
    if (!deviceId || resetting) return;

    Alert.alert(
      'Reset Device',
      'This will remove this device from your account and restore default settings so it can be claimed by another user. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              const user = await getUserData();
              if (!user?.id) {
                Alert.alert('Error', 'User information is missing. Please log in again.');
                return;
              }

              await resetDevice(deviceId, user.id);
              Alert.alert('Device Reset', 'The device has been reset and is ready for transfer.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error) {
              Alert.alert('Error', 'Failed to reset the device. Please try again.');
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.form}>
        <View style={styles.section}>
          <Text style={styles.title}>Device Name</Text>
          <Text style={styles.subtitle}>
            Provide a friendly label so you can quickly identify this camera across your network.
          </Text>
          <TextInput
            value={nameInput}
            onChangeText={setNameInput}
            placeholder="Enter device name"
            style={styles.input}
            editable={!nameSaving}
            autoCapitalize="words"
          />
          <TouchableOpacity
            style={[styles.primaryButton, (!isNameDirty || nameSaving) && styles.primaryButtonDisabled]}
            onPress={handleNameSave}
            disabled={!isNameDirty || nameSaving}
          >
            <Text style={styles.primaryButtonText}>{nameSaving ? 'Saving…' : 'Save Name'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>Stream Mode</Text>
          <Text style={styles.subtitle}>
            Choose how this device delivers its video stream. Local mode connects directly to the device,
            while Relay uses the cloud relay for remote access.
          </Text>
          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={
                streamMode === 'local' ? styles.modeButtonActive : styles.modeButton
              }
              onPress={() => handleModeChange('local')}
              disabled={modeLoading || modeSaving}
            >
              <Text
                style={
                  streamMode === 'local'
                    ? styles.modeButtonTextActive
                    : styles.modeButtonText
                }
              >
                Local
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={
                streamMode === 'relay' ? styles.modeButtonActive : styles.modeButton
              }
              onPress={() => handleModeChange('relay')}
              disabled={modeLoading || modeSaving}
            >
              <Text
                style={
                  streamMode === 'relay'
                    ? styles.modeButtonTextActive
                    : styles.modeButtonText
                }
              >
                Relay
              </Text>
            </TouchableOpacity>
          </View>
          {(modeLoading || modeSaving) && (
            <Text style={styles.statusText}>
              {modeLoading ? 'Loading current mode…' : 'Updating mode…'}
            </Text>
          )}
        </View>

        <Text style={styles.title}>Device Actions</Text>
        <Text style={styles.subtitle}>
          Resetting removes this device from your account and restores default settings so it can be claimed again.
        </Text>

        <TouchableOpacity
          style={[styles.resetButton, resetting && styles.resetButtonDisabled]}
          onPress={handleResetPress}
          disabled={resetting}
        >
          <Text style={styles.resetButtonText}>{resetting ? 'Resetting...' : 'Reset Device'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  form: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#fecaca',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 16,
  },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
  },
  modeButtonTextActive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  statusText: {
    marginTop: 12,
    fontSize: 13,
    color: '#6B7280',
  },
  resetButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: 'white',
  },
  resetButtonDisabled: {
    borderColor: '#FECACA',
    backgroundColor: '#F9FAFB',
  },
  resetButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 16,
  },
});