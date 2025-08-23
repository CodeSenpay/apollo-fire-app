import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export default function CameraPage() {
  const router = useRouter();
  const handleCameraCardPress = () => {
    // router.push("/camera/1");
  };
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <TouchableOpacity
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          shadowColor: "#000",
          shadowOpacity: 0.1,
          shadowRadius: 6,
          padding: 24,
          width: 288,
          alignItems: "center",
        }}
        onPress={handleCameraCardPress}
        activeOpacity={0.8}
      >
        <Text style={{ fontSize: 20, fontWeight: "600", marginBottom: 8 }}>
          Camera 1
        </Text>
        <Text style={{ color: "#6b7280" }}>Tap to view live feed</Text>
      </TouchableOpacity>
    </View>
  );
}
