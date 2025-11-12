import { Image, Text, View } from "react-native";
import { APP_DISPLAY_NAME } from "@/src/constants/branding";

export default function SplashScreen() {
  return (
    <View>
      <Image
        source={require("../assets/images/icon.png")}
        style={{ width: 200, height: 200 }}
      />
      <Text>Welcome to {APP_DISPLAY_NAME}</Text>
    </View>
  );
}
