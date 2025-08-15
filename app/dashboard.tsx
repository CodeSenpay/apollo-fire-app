import Navbar from "@/src/components/navbar";
import { Text, View } from "react-native";
export default function Dashboard() {
  return (
    <>
    <Navbar/>
    <View className="flex-1 justify-center items-center">
      <Text className="text-2xl font-bold">Dashboard</Text>
    </View>
    </>

  );
}