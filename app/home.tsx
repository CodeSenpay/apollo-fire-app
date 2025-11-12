import {
  NotificationHistoryEntry,
  getNotificationHistory,
  getUserDevices,
} from "@/src/services/apiConfig";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { APP_NAME } from "@/src/constants/branding";

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
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const ids = await getUserDevices();
      setDeviceIds(ids);

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
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroGlowSecondary} />
          <View style={styles.heroContent}>
            <Text style={styles.heroBadge}>{APP_NAME}</Text>
            <Text style={styles.heroTitle}>Stay ahead of potential fire hazards</Text>
            <Text style={styles.heroSubtitle}>
              Monitor every camera feed in real-time and receive AI-powered alerts before risks escalate.
            </Text>
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.heroPrimaryAction} onPress={() => router.push("/add-device")}>
                <Ionicons name="add-circle" size={20} color="#ffffff" />
                <Text style={styles.heroPrimaryActionText}>Link new device</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroSecondaryAction}
                onPress={() => navigation.navigate("Notifications")}
              >
                <Ionicons name="notifications" size={18} color="#ef4444" />
                <Text style={styles.heroSecondaryActionText}>View alerts</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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
                  notifications.filter(n => n.notificationType === 'ml_alert').length > 0 ? styles.summaryValueCritical : undefined,
                ]}
              >
                {notifications.filter(n => n.notificationType === 'ml_alert').length}
              </Text>
              <Text style={styles.summaryLabel}>Critical Alerts</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>--</Text>
              <Text style={styles.summaryLabel}>Cam Streams</Text>
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
          <Text style={styles.sectionTitle}>Registered Devices</Text>
          {deviceIds.length === 0 && !loading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No devices claimed yet</Text>
              <Text style={styles.emptySubtitle}>
                Link your {APP_NAME} hardware to start streaming camera feeds.
              </Text>
            </View>
          ) : (
            deviceIds.map((id) => (
              <View key={id} style={styles.deviceCard}>
                <View style={styles.deviceCardHeader}>
                  <Text style={styles.deviceCardTitle}>{id}</Text>
                  <Text style={styles.deviceCardBadge}>Streaming Ready</Text>
                </View>
                <View style={styles.deviceDescriptionWrapper}>
                  <Text style={styles.deviceDescription}>
                    Tap the device to open its live camera stream and manage connection mode.
                  </Text>
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
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    position: "relative",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 4,
  },
  heroGlow: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(37,99,235,0.25)",
    opacity: 0.6,
  },
  heroGlowSecondary: {
    position: "absolute",
    bottom: -40,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(239,68,68,0.3)",
    opacity: 0.5,
  },
  heroContent: {
    gap: 14,
  },
  heroBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239,68,68,0.18)",
    color: "#f87171",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#f9fafb",
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: 14,
    color: "#e2e8f0",
    lineHeight: 20,
  },
  heroActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    flexWrap: "wrap",
  },
  heroPrimaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ef4444",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  heroPrimaryActionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  heroSecondaryAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239,68,68,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
  },
  heroSecondaryActionText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "600",
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
  deviceDescriptionWrapper: {
    marginTop: 10,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  deviceDescription: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 18,
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
