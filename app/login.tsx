// app/pin-verify.tsx
import { isPinEnabled, verifyPin } from "@/src/services/pin";
import { usePinGate } from "@/src/state/pinGate";
import * as LocalAuthentication from "expo-local-authentication";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Button, Image, Text, TextInput, View } from "react-native";
// optional biometrics
// import * as LocalAuthentication from 'expo-local-authentication';

const MAX_ATTEMPTS = 5;

export default function PinVerify() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [tries, setTries] = useState(0);
  const { setUnlocked } = usePinGate();
  // If user disabled PIN while this screen is open, skip back to home
  useEffect(() => {
    (async () => {
      if (!(await isPinEnabled())) router.replace("/dashboard");
    })();
  }, []);

  async function onUnlock() {
    const ok = await verifyPin(pin);
    console.log(`This is Okay Variable: ${ok}`);
    if (ok) {
      setUnlocked(true);
      router.replace("/dashboard"); // go to dashboard
    } else {
      const next = tries + 1;
      setTries(next);
      setPin("");
      if (next >= MAX_ATTEMPTS) {
        Alert.alert("Too many attempts", "Please wait and try again.");
      } else {
        Alert.alert("Incorrect PIN", `Attempts left: ${MAX_ATTEMPTS - next}`);
      }
    }
  }

  async function tryBiometric() {
    const avail = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!avail || !enrolled) return;
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock",
    });
    if (res.success) {
      setUnlocked(true);
      router.replace("/dashboard");
    }
  }

  return (
    <>
      <View
        style={{
          width: "100%",
          flex: 1,
          justifyContent: "center",
          padding: 20,
          gap: 12,
        }}
      >
        <View className="w-full items-center">
          <Image
            source={require("../assets/images/icon.png")}
            style={{ width: 200, height: 200 }}
          />
        </View>
        <Text style={{ fontSize: 20, fontWeight: "700", textAlign: "center" }}>
          Enter PIN
        </Text>
        <TextInput
          placeholder="••••"
          secureTextEntry
          keyboardType="number-pad"
          value={pin}
          onChangeText={setPin}
          style={{
            borderWidth: 1,
            padding: 14,
            borderRadius: 12,
            textAlign: "center",
            fontSize: 24,
            letterSpacing: 4,
          }}
        />
        <Button title="Unlock" onPress={onUnlock} />
        <Button title="Use biometrics" onPress={tryBiometric} />
      </View>
    </>
  );
}
