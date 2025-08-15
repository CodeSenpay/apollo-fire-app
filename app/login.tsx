import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, TouchableOpacity, View } from "react-native";

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
        if(email === "robertmayo@gmail.com" && password === "123") {
            router.replace("/dashboard");
        }
    };

    return (
        <View className="flex-1 bg-gray-50 justify-center items-center px-6">
            <Text className="text-3xl font-bold text-slate-800 mb-2">Welcome Back</Text>
            <Text className="text-base text-slate-500 mb-8">Sign in to your account</Text>
            <TextInput
                className="w-full h-12 bg-white rounded-lg px-4 mb-4 text-base border border-gray-200"
                placeholder="Email"
                placeholderTextColor="#888"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <View className="w-full mb-4 relative">
                <TextInput
                    className="h-12 bg-white rounded-lg px-4 text-base border border-gray-200 pr-10"
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
            <TouchableOpacity className="w-full h-12 bg-blue-600 rounded-lg justify-center items-center mb-4 shadow">
                <Text className="text-white text-lg font-bold" onPress={handleLogin}>Login</Text>
            </TouchableOpacity>
            <Text className="text-sm text-slate-500">
                Don't have an account? <Text className="text-blue-600 font-bold">Sign Up</Text>
            </Text>
        </View>
    );
}
