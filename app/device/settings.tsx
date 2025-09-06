// app/device/settings.tsx
import { db } from '@/src/services/firebaseConfig';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { get, ref, set } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function DeviceSettingsScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [tempThreshold, setTempThreshold] = useState('');
  const [gasThreshold, setGasThreshold] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch current thresholds from Firebase when the screen loads
  useEffect(() => {
    if (!deviceId) return;

    const thresholdsRef = ref(db, `devices/${deviceId}/thresholds`);
    get(thresholdsRef).then((snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTempThreshold(data.temperature?.toString() || '45.0');
        setGasThreshold(data.gas?.toString() || '1000');
      } else {
        // Set default values if none are found
        setTempThreshold('45.0');
        setGasThreshold('1000');
      }
      setLoading(false);
    });
  }, [deviceId]);

  const handleSave = async () => {
    if (!deviceId) return;
    setSaving(true);

    const temp = parseFloat(tempThreshold);
    const gas = parseInt(gasThreshold, 10);

    if (isNaN(temp) || isNaN(gas)) {
      Alert.alert('Invalid Input', 'Please enter valid numbers for the thresholds.');
      setSaving(false);
      return;
    }

    const thresholdsRef = ref(db, `devices/${deviceId}/thresholds`);
    try {
      await set(thresholdsRef, {
        temperature: temp,
        gas: gas,
      });
      Alert.alert('Success', 'Thresholds have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to save thresholds. Please try again.');
    } finally {
      setSaving(false);
    }
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
          Adjust the values that trigger a critical alert. The device will restart to apply changes.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>High Temperature Alert (°C)</Text>
          <TextInput
            style={styles.input}
            value={tempThreshold}
            onChangeText={setTempThreshold}
            keyboardType="numeric"
            placeholder="e.g., 45.0"
          />
        </View>

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
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
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
});