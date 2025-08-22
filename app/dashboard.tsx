import Navbar from "@/src/components/navbar";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export default function Dashboard() {
  const router = useRouter();

  const handleCameraCardPress = () => {
    // Replace '/camera/1' with your actual camera route or id
    // router.push("/camera/1");
  };

  return (
    <>
      <Navbar />
      <View className="flex-1 justify-center items-center">
        <Text className="text-2xl font-bold mb-6">Dashboard</Text>
        <TouchableOpacity
          className="bg-white rounded-lg shadow p-6 w-72 items-center"
          onPress={handleCameraCardPress}
          activeOpacity={0.8}
        >
          <Text className="text-xl font-semibold mb-2">Camera 1</Text>
          <Text className="text-gray-500">Tap to view live feed</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
