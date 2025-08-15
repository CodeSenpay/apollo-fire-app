import { Stack } from "expo-router";
import "./global.css";
export default function RootLayout() {
  return (<Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="dashboard" options={{ headerShown: false , statusBarHidden:true }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
  </Stack>);
}
