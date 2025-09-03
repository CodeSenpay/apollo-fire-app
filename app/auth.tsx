import { auth } from "@/src/services/firebaseConfig";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import React, { useState } from "react";
import {
  Alert,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert("Hold up!", "Please fill in both email and password.");
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // On success, the AuthProvider in _layout will handle navigation
    } catch (error: any) {
      Alert.alert("Login Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      return Alert.alert("Hold up!", "Please fill in both email and password.");
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // On success, the AuthProvider in _layout will handle navigation
    } catch (error: any) {
      Alert.alert("Sign Up Error", error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ paddingHorizontal: 24, flex: 1, justifyContent: 'center' }}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/icon.png")}
            style={styles.logo}
          />
        </View>
        <Text style={styles.title}>Welcome to Apollo Fire</Text>
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonTextPrimary}>
            {loading ? "Logging in..." : "Login"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonTextSecondary}>
            {loading ? "Signing up..." : "Sign Up"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  logoContainer: {
    alignItems: "center",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 24,
    color: "#1f2937",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: "#ef4444",
  },
  buttonSecondary: {
    backgroundColor: "#f3f4f6",
  },
  buttonTextPrimary: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: "#1f2937",
    fontWeight: "600",
    fontSize: 16,
  },
});