import { Image, Text, View } from "react-native";

export default function SplashScreen() {
  return (
    <View>
      <Image
        source={require("../assets/images/icon.png")}
        style={{ width: 200, height: 200 }}
      />
      <Text>Welcome to Apollo Fire App</Text>
    </View>
  );
}
