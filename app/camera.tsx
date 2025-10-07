import { getDeviceDetails, getUserDevices } from '@/src/services/apiConfig';
import { useAuth } from '@/src/state/pinGate';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface DeviceInfo {
  id: string;
  name: string;
}

export default function DeviceListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchDevices = async () => {
      setLoading(true);
      try {
        const deviceIds = await getUserDevices();
        const deviceDetailsPromises = deviceIds.map(async (id) => {
          const details = await getDeviceDetails(id);
          return { id, name: details.name || `Device ${id.slice(0, 6)}` };
        });
        const devicesWithDetails = await Promise.all(deviceDetailsPromises);
        setDevices(devicesWithDetails);
      } catch (error) {
        console.error('Error fetching devices:', error);
        setDevices([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, [user]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {devices.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>You have no claimed devices.</Text>
          <Text style={styles.emptySubText}>Press the '+' icon to add one.</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.itemContainer}
              onPress={() => router.push({ pathname: "/device/[id]", params: { id: item.id } })}
            >
              <Ionicons name="camera-outline" size={24} color="#4B5563" />
              <View style={styles.itemTextContainer}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemId}>{item.id}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        />
      )}
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
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    marginVertical: 8,
    marginHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  itemTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  itemId: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  emptyText: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '600',
  },
  emptySubText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  }
});