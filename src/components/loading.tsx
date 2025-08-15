import { Text, View } from "react-native";

export default function Loading() {
  return (
    <View className="flex-1 justify-center items-center">
      <Text className="text-gray-500">Loading...</Text>
    </View>
  );
}