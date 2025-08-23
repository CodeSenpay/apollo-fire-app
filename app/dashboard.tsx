import Navbar from "@/src/components/navbar";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import * as React from "react";
import CameraPage from "./camera";
import HomePage from "./home";
import ProfilePage from "./profile";

// Home Screen
function HomeScreen() {
  return <HomePage />;
}

function CameraScreen() {
  return <CameraPage />;
}

// Me Screen
function MeScreen() {
  return <ProfilePage />;
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
