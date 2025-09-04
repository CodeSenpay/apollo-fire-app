import { auth } from "@/src/services/firebaseConfig";
import { createUserWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import React, { useState } from "react";
import { Alert, Image, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGuestLogin = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
    } catch (e: any) {
      Alert.alert("Guest Login Error", e.message);
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Hold up!", "Please fill in both email and password.");
      return;
    }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e: any) {
      Alert.alert("Sign Up Error", e.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ paddingHorizontal: 24, flex: 1, justifyContent: 'center' }}>
        <View style={styles.logoContainer}>
          <Image source={require("../assets/images/icon.png")} style={styles.logo} />
        </View>
        <Text style={styles.title}>Welcome to Apollo Fire</Text>
        <TextInput
          placeholder="Email"
          style={styles.input}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          placeholder="Password"
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonTextPrimary}>
            {loading ? "Please wait..." : "Sign Up"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, { marginTop: 10 }]}
          onPress={handleGuestLogin}
          disabled={loading}
        >
          <Text style={styles.buttonTextSecondary}>
            {loading ? "Please wait..." : "Continue as Guest"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  logoContainer: { alignItems: "center" },
  logo: { width: 120, height: 120, marginBottom: 24 },
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
  buttonPrimary: { backgroundColor: "#ef4444" },
  buttonSecondary: { backgroundColor: "#f3f4f6" },
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