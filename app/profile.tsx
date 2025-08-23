import Navbar from "@/src/components/navbar";
import { Text, View } from "react-native";
export default function ProfilePage() {
  return (
    <>
      <Navbar />
      <View className="flex-1 justify-center items-center">
        <Text className="text-2xl font-bold">Profile Page!</Text>
      </View>
    </>
  );
}
