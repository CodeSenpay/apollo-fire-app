import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Image,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = () => {
    if (!email || !password) {
      alert("Please enter both email and password");
      return;
    }
    if (email === "123" && password === "123") {
      router.replace("/dashboard");
    }
  };

  const googleLogin = () => {};
  return (
    <View className="w-full flex-1 justify-center items-center px-6 bg-gradient-to-br from-red-100 via-blue-100 to-gray-200">
      <Image
        source={require("../assets/images/icon.png")}
        style={{ width: 120, height: 120 }}
        className="mb-4"
      />
      <Text className="text-xl font-semibold text-slate-700 mb-6">
        Sign in to your account
      </Text>
      <TextInput
        className="w-full h-12 bg-white rounded-lg px-4 mb-4 text-base border border-gray-200 shadow"
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <View className="w-full mb-4 relative">
        <TextInput
          className="h-12 bg-white rounded-lg px-4 text-base border border-gray-200 pr-10 shadow"
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
        />
        <Pressable
          style={{
            position: "absolute",
            right: 16,
            top: 12,
          }}
          onPress={() => setShowPassword((prev) => !prev)}
        >
          <Ionicons
            name={showPassword ? "eye-off" : "eye"}
            size={24}
            color="#888"
          />
        </Pressable>
      </View>
      <TouchableOpacity
        className="w-full h-12 bg-green-600 rounded-lg justify-center items-center mb-4 shadow-lg"
        onPress={handleLogin}
      >
        <Text className="text-white text-lg font-bold">Login</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="w-full h-12 bg-blue-600 rounded-lg justify-center items-center mb-4 shadow-lg"
        onPress={googleLogin}
      >
        <Text className="text-white text-lg font-bold">Login via Google</Text>
      </TouchableOpacity>
      <Text className="text-sm text-slate-500 mt-2">
        Don't have an account?{" "}
        <Text className="text-blue-600 font-bold">Sign Up</Text>
      </Text>
    </View>
  );
}
