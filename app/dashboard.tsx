import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Link } from "expo-router";
import * as React from "react";
import { Pressable } from "react-native";
import CameraPage from "./camera";
import HomePage from "./home";
import NotificationsPage from "./notifications";
import ProfilePage from "./profile";

function HomeScreen() {
  return <HomePage />;
}

// This screen now shows the list of devices
function DevicesScreen() {
  return <CameraPage />;
}

function MeScreen() {
  return <ProfilePage />;
}

function NotificationsScreen() {
  return <NotificationsPage />;
}

const Tab = createBottomTabNavigator();

export default function Dashboard() {
  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = "help";

            if (route.name === "Home") {
              iconName = focused ? "home" : "home-outline";
            } else if (route.name === "Devices") { // Changed from "Camera"
              iconName = focused ? "camera" : "camera-outline";
            } else if (route.name === "Notifications") {
              iconName = focused ? "notifications" : "notifications-outline";
            } else if (route.name === "Me") {
              iconName = focused ? "person" : "person-outline";
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            headerTitle: "My Devices",
            headerShown: true,
            // The button has been removed from here
          }}
        />
        <Tab.Screen
          name="Devices" // This was formerly the "Camera" screen
          component={DevicesScreen}
          options={{
            headerTitle: "Devices", // Changed header title for add-device page
            headerShown: true,
            // --- THIS IS THE FIX ---
            // The "Add Device" button is now here
            headerRight: () => (
              <Link href={"/add-device" as any} asChild>
                <Pressable style={{ marginRight: 15 }}>
                  <Ionicons name="add-circle" size={32} color="#ef4444" />
                </Pressable>
              </Link>
            ),
          }}
        />
        <Tab.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{
            headerShown: false,
          }}
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