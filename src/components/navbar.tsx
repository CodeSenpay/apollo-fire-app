import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

export default function Navbar() {
  const router = useRouter();

  const handleNotification = () => {
    router.push("/notifications");
  };

  return (
    <View
      style={styles.navbar}
      className="flex-row items-center justify-between px-6 py-6 bg-white"
    >
      <Image
        source={require("../../assets/images/icon.png")}
        style={{ width: 50, height: 50 }}
      />
      <Text className="text-xl font-extrabold text-red-700 tracking-wide">
        Apollo Fire
      </Text>
      <View className="flex-row gap-5">
        <Pressable
          android_ripple={{ color: "#e0e7ff" }}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: pressed ? "#eff6ff" : "#f3f4f6",
              shadowColor: pressed ? "#2563eb" : undefined,
              shadowOpacity: pressed ? 0.15 : 0,
            },
          ]}
          onPress={handleNotification}
        >
          <Ionicons name="notifications-outline" size={23} color="#bd0000" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    position: "absolute",
    top: 15,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 8,
    borderBottomWidth: 0,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderRadius: 16,
    margin: 12,
    backgroundColor: "white",
  },
  iconButton: {
    padding: 10,
    borderRadius: 12,
  },
});
