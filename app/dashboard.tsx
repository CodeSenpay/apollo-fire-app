import Navbar from "@/src/components/navbar";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useRouter } from "expo-router";
import * as React from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Home Screen
function HomeScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Home</Text>
    </View>
  );
}

// Camera Screen
function CameraScreen() {
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

// Me Screen
function MeScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Text>Me</Text>
    </View>
  );
}

const Tab = createBottomTabNavigator();

export default function Dashboard() {
  return (
    <>
      <Navbar />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: string = "help"; // default icon

            if (route.name === "Home") {
              iconName = focused ? "home" : "home-outline";
            } else if (route.name === "Camera") {
              iconName = focused ? "camera" : "camera-outline";
            } else if (route.name === "Me") {
              iconName = focused ? "person" : "person-outline";
            }

            return (
              <Ionicons name={iconName as any} size={size} color={color} />
            );
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Camera" component={CameraScreen} />
        <Tab.Screen name="Me" component={MeScreen} />
      </Tab.Navigator>
    </>
  );
}
