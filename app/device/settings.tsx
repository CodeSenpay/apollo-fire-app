// app/device/settings.tsx
import { getDeviceThresholds, updateDeviceThresholds, resetDevice, getUserData } from '@/src/services/apiConfig';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function DeviceSettingsScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [gasThreshold, setGasThreshold] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Fetch current thresholds from API when the screen loads
  useEffect(() => {
    if (!deviceId) return;

    const fetchThresholds = async () => {
      try {
        const data = await getDeviceThresholds(deviceId);
        setGasThreshold(data.gas?.toString() || '1000');
      } catch (error) {
        console.error('Error fetching thresholds:', error);
        // Set default values if fetch fails
        setGasThreshold('1000');
      } finally {
        setLoading(false);
      }
    };

    fetchThresholds();
  }, [deviceId]);

  const handleSave = async () => {
    if (!deviceId) return;
    setSaving(true);

    const gas = parseInt(gasThreshold, 10);

    if (isNaN(gas)) {
      Alert.alert('Invalid Input', 'Please enter a valid number for the gas threshold.');
      setSaving(false);
      return;
    }

    try {
      await updateDeviceThresholds(deviceId, gas);
      Alert.alert('Success', 'Gas threshold has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save threshold. Please try again.');
    } finally {
      setSaving(false);
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Sensor Thresholds</Text>
        <Text style={styles.subtitle}>
          Adjust the gas level that triggers a critical alert. The device will restart to apply changes.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Gas ADC Alert Level</Text>
          <TextInput
            style={styles.input}
            value={gasThreshold}
            onChangeText={setGasThreshold}
            keyboardType="number-pad"
            placeholder="e.g., 1000"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, (saving || resetting) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving || resetting}
        >
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetButton, resetting && styles.resetButtonDisabled]}
          onPress={handleResetPress}
          disabled={resetting || saving}
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    padding: 20,
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: 'white',
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: '#F87171',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
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