import { NotificationHistoryEntry, getNotificationHistory } from "@/src/services/apiConfig";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotificationHistory(100);
      setNotifications(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [loadNotifications])
  );

  const renderItem = ({ item }: { item: NotificationHistoryEntry }) => {
    const sentAt = new Date(item.sentAt).toLocaleString();
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.device}>{item.deviceId ?? "Unknown Device"}</Text>
          <Text style={styles.timestamp}>{sentAt}</Text>
        </View>
        {item.title ? <Text style={styles.title}>{item.title}</Text> : null}
        {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
        {item.notificationType ? (
          <Text style={styles.type}>{item.notificationType}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.heading}>Notification History</Text>
        {loading && notifications.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color="#ef4444" />
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={
              notifications.length === 0 ? styles.emptyContainer : styles.listContent
            }
            ListEmptyComponent={<Text style={styles.emptyText}>No notifications yet.</Text>}
            refreshing={loading}
            onRefresh={loadNotifications}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 100,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  device: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ef4444",
  },
  timestamp: {
    fontSize: 12,
    color: "#6b7280",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  body: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 8,
  },
  type: {
    fontSize: 12,
    color: "#2563eb",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#dbeafe",
    borderRadius: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
  },
});
