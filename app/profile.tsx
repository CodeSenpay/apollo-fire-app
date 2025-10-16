import Navbar from "@/src/components/navbar";
import { logout } from "@/src/services/apiConfig";
import { useAuth } from "@/src/state/pinGate";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, Text, TouchableOpacity, View } from "react-native";

export default function ProfilePage() {
  const router = useRouter();
  const { setUser } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      router.replace("/auth");
    } catch (error) {
      Alert.alert("Logout Error", "Failed to logout. Please try again.");
    }
  };
  return (
    <>
      <Navbar />
      <View className="flex-1 justify-center items-center bg-gray-50">
        <View className="w-80 gap-6 items-center mb-6">
          <MaterialIcons name="account-circle" size={64} color="#3b82f6" />
          <Text className="text-xl font-bold text-gray-800">
            Quinie Gonzaga
          </Text>
        </View>
        <View className="w-80 gap-3">
          <TouchableOpacity
            className="bg-blue-600 rounded-xl py-4 shadow-md active:bg-blue-700"
            onPress={() => router.push("/addsecurity")}
          >
            <Text className="text-white text-lg font-semibold text-center">
              Add Security
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-purple-600 rounded-xl py-4 shadow-md active:bg-purple-700"
            onPress={() => {}}
          >
            <Text className="text-white text-lg font-semibold text-center">
              Appearance
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-green-600 rounded-xl py-4 shadow-md active:bg-green-700"
            onPress={() => {}}
          >
            <Text className="text-white text-lg font-semibold text-center">
              Camera Memory
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-red-600 rounded-xl py-4 shadow-md active:bg-red-700"
            onPress={handleLogout}
          >
            <Text className="text-white text-lg font-semibold text-center">
              Logout
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
