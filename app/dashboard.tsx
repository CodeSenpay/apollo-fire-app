import Navbar from "@/src/components/navbar";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Link } from "expo-router";
import * as React from "react";
import { Pressable } from "react-native";
import CameraPage from "./camera";
import HomePage from "./home";
import ProfilePage from "./profile";

function HomeScreen() {
  return <HomePage />;
}

function CameraScreen() {
  return <CameraPage />;
}

function MeScreen() {
  return <ProfilePage />;
}

const Tab = createBottomTabNavigator();

export default function Dashboard() {
  return (
    <>
      {/* <Navbar /> */}
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = "help"; // More specific type for icons

            if (route.name === "Home") {
              iconName = focused ? "home" : "home-outline";
            } else if (route.name === "Camera") {
              iconName = focused ? "camera" : "camera-outline";
            } else if (route.name === "Me") {
              iconName = focused ? "person" : "person-outline";
            }

            return (
              <Ionicons name={iconName} size={size} color={color} />
            );
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerTitle: "My Devices",
            headerShown: true,
            headerRight: () => (
              // FIX: Cast the href to suppress the typed-route error until the server is restarted.
              <Link href={"/add-device" as any} asChild>
                <Pressable style={{ marginRight: 15 }}>
                  <Ionicons name="add-circle" size={32} color="#ef4444" />
                </Pressable>
              </Link>
            ),
          }}
        />
        <Tab.Screen
          name="Camera"
          component={CameraScreen}
          options={{ headerTitle: "Live Stream", headerShown: true }}
        />
        <Tab.Screen
          name="Me"
          component={MeScreen}
          options={{ headerTitle: "Profile", headerShown: true }}
        />
      </Tab.Navigator>
    </>
  );
}

