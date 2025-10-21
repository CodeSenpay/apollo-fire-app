// app/device/settings.tsx
import { resetDevice, getUserData } from '@/src/services/apiConfig';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DeviceSettingsScreen() {
  const { id: deviceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [resetting, setResetting] = useState(false);

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