import {
  DeviceData,
  NotificationHistoryEntry,
  getDeviceReadings,
  getNotificationHistory,
  getUserDevices,
} from "@/src/services/apiConfig";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface DeviceStatus {
  id: string;
  data: DeviceData | null;
}

interface QuickActionButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

function QuickActionButton({ icon, label, onPress }: QuickActionButtonProps) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickActionIconWrapper}>
        <Ionicons name={icon} size={22} color="#ef4444" />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function HomePage() {
  const router = useRouter();
  const navigation = useNavigation<any>();

  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([]);
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const ids = await getUserDevices();
      setDeviceIds(ids);

      const readings = await Promise.all(
        ids.map(async (id) => {
          try {
            const data = await getDeviceReadings(id);
            return { id, data } as DeviceStatus;
          } catch (error) {
            console.error(`Error fetching readings for device ${id}:`, error);
            return { id, data: null } as DeviceStatus;
          }
        })
      );
      setDeviceStatuses(readings);

      const recentNotifications = await getNotificationHistory(3);
      setNotifications(recentNotifications);
    } catch (error) {
      console.error("Error loading home data:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const run = async () => {
        setLoading(true);
        await loadData();
        if (isActive) {
          setLoading(false);
        }
      };

      run();

      return () => {
        isActive = false;
      };
    }, [loadData])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const criticalDevices = useMemo(
    () =>
      deviceStatuses.filter((status) => Boolean(status.data?.isCriticalAlert)).length,
    [deviceStatuses]
  );

  const averageGasValue = useMemo(() => {
    const gasValues = deviceStatuses
      .map((status) => status.data?.gasValue)
      .filter((value): value is number => typeof value === "number");

    if (!gasValues.length) {
      return null;
    }

    const total = gasValues.reduce((sum, value) => sum + value, 0);
    return Math.round(total / gasValues.length);
  }, [deviceStatuses]);

  return (
    <View style={styles.container}>
      {/* Background Circles */}
      <View style={styles.circle1} />
      <View style={styles.circle2} />
      <View style={styles.circle3} />

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#ef4444" />
        }
      >
        <Text style={styles.pageTitle}>Your Home Dashboard</Text>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Network Overview</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{deviceIds.length}</Text>
              <Text style={styles.summaryLabel}>Devices Linked</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  criticalDevices > 0 ? styles.summaryValueCritical : undefined,
                ]}
              >
                {criticalDevices}
              </Text>
              <Text style={styles.summaryLabel}>Critical Alerts</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{averageGasValue ?? "--"}</Text>
              <Text style={styles.summaryLabel}>Avg. Gas Level</Text>
            </View>
          </View>
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color="#ef4444" />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            <QuickActionButton icon="add-circle" label="Add Device" onPress={() => router.push("/add-device")} />
            <QuickActionButton icon="hardware-chip" label="Manage Devices" onPress={() => navigation.navigate("Devices")} />
            <QuickActionButton icon="notifications" label="View Alerts" onPress={() => navigation.navigate("Notifications")} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Status</Text>
          {deviceIds.length === 0 && !loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No devices claimed yet</Text>
              <Text style={styles.emptySubtitle}>
                Link your Apollo hardware to start receiving telemetry and safety alerts.
              </Text>
            </View>
          ) : (
            deviceStatuses.map((status) => (
              <View key={status.id} style={styles.deviceCard}>
                <View style={styles.deviceCardHeader}>
                  <Text style={styles.deviceCardTitle}>{status.id}</Text>
                  <Text
                    style={[
                      styles.deviceCardBadge,
                      status.data?.isCriticalAlert ? styles.deviceCardBadgeCritical : undefined,
                    ]}
                  >
                    {status.data?.isCriticalAlert ? "Critical" : "Stable"}
                  </Text>
                </View>
                <View style={styles.deviceMetricsRow}>
                  <View style={styles.deviceMetric}>
                    <Text style={styles.metricLabel}>Gas Value</Text>
                    <Text style={styles.metricValue}>{status.data?.gasValue ?? "--"}</Text>
                  </View>
                  <View style={styles.deviceMetric}>
                    <Text style={styles.metricLabel}>Flame</Text>
                    <Text style={styles.metricValue}>
                      {status.data?.isFlameDetected ? "Detected" : "Normal"}
                    </Text>
                  </View>
                  <View style={styles.deviceMetric}>
                    <Text style={styles.metricLabel}>Updated</Text>
                    <Text style={styles.metricValue}>
                      {status.data?.lastUpdate
                        ? new Date(status.data.lastUpdate).toLocaleTimeString()
                        : "--"}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Alerts</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Notifications")}> 
              <Text style={styles.sectionLink}>View all</Text>
            </TouchableOpacity>
          </View>
          {notifications.length === 0 && !loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>All clear</Text>
              <Text style={styles.emptySubtitle}>No alerts have been raised in your network recently.</Text>
            </View>
          ) : (
            notifications.map((notification) => (
              <View key={notification.id} style={styles.notificationCard}>
                <View style={styles.notificationHeader}>
                  <Text style={styles.notificationDevice}>{notification.deviceId ?? "Unknown Device"}</Text>
                  <Text style={styles.notificationTimestamp}>
                    {new Date(notification.sentAt).toLocaleString()}
                  </Text>
                </View>
                {notification.title ? (
                  <Text style={styles.notificationTitle}>{notification.title}</Text>
                ) : null}
                {notification.body ? <Text style={styles.notificationBody}>{notification.body}</Text> : null}
                {notification.notificationType ? (
                  <Text style={styles.notificationType}>{notification.notificationType}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 24,
    position: "relative",
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 24,
  },
  circle1: {
    position: "absolute",
    top: -60,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#6366f1",
    opacity: 0.08,
  },
  circle2: {
    position: "absolute",
    bottom: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#18181b",
    opacity: 0.06,
  },
  circle3: {
    position: "absolute",
    top: 120,
    right: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6366f1",
    opacity: 0.07,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0f172a",
  },
  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
  },
  summaryValueCritical: {
    color: "#dc2626",
  },
  summaryLabel: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  loadingOverlay: {
    marginTop: 12,
    alignItems: "center",
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 1,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  sectionLink: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2563eb",
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  quickAction: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    gap: 10,
  },
  quickActionIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(239,68,68,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
    textAlign: "center",
    paddingHorizontal: 4,
  },
  emptyCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 14,
    padding: 18,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#6b7280",
  },
  deviceCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
  deviceCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deviceCardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  deviceCardBadge: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16a34a",
    backgroundColor: "rgba(22,163,74,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  deviceCardBadgeCritical: {
    color: "#b91c1c",
    backgroundColor: "rgba(220,38,38,0.12)",
  },
  deviceMetricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  deviceMetric: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    gap: 6,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 12,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "center",
  },
  notificationCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  notificationDevice: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ef4444",
  },
  notificationTimestamp: {
    fontSize: 12,
    color: "#6b7280",
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  notificationBody: {
    fontSize: 13,
    color: "#374151",
  },
  notificationType: {
    fontSize: 11,
    color: "#2563eb",
    alignSelf: "flex-start",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
