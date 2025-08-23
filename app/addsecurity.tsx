import {
  disablePin,
  enablePin,
  isPinEnabled,
  verifyPin,
} from "@/src/services/pin";
import React, { useEffect, useState } from "react";
import { Alert, Button, Text, TextInput, View } from "react-native";

export default function SettingsScreen() {
  const [enabled, setEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [current, setCurrent] = useState("");

  useEffect(() => {
    isPinEnabled().then(setEnabled);
  }, []);

  async function onEnable() {
    if (pin.length < 4) return Alert.alert("PIN must be at least 4 digits.");
    if (pin !== confirm) return Alert.alert("PINs do not match.");
    await enablePin(pin);
    setEnabled(true);
    setPin("");
    setConfirm("");
    Alert.alert("PIN enabled");
  }

  async function onDisable() {
    if (!(await verifyPin(current))) return Alert.alert("Wrong current PIN.");
    await disablePin();
    setEnabled(false);
    setCurrent("");
    Alert.alert("PIN disabled");
  }

  async function onChange() {
    if (!(await verifyPin(current))) return Alert.alert("Wrong current PIN.");
    if (pin.length < 4)
      return Alert.alert("New PIN must be at least 4 digits.");
    if (pin !== confirm) return Alert.alert("PINs do not match.");
    await enablePin(pin);
    setCurrent("");
    setPin("");
    setConfirm("");
    Alert.alert("PIN changed");
  }

  return (
    <View className="w-full flex-1 justify-center p-10 gap-3">
      <Text style={{ fontSize: 18, fontWeight: "700" }}>
        App Security (PIN)
      </Text>

      {!enabled ? (
        <>
          <TextInput
            placeholder="New PIN"
            secureTextEntry
            keyboardType="number-pad"
            value={pin}
            onChangeText={setPin}
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
          />
          <TextInput
            placeholder="Confirm PIN"
            secureTextEntry
            keyboardType="number-pad"
            value={confirm}
            onChangeText={setConfirm}
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
          />
          <Button title="Enable PIN" onPress={onEnable} />
        </>
      ) : (
        <>
          <TextInput
            placeholder="Current PIN"
            secureTextEntry
            keyboardType="number-pad"
            value={current}
            onChangeText={setCurrent}
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
          />
          <TextInput
            placeholder="New PIN"
            secureTextEntry
            keyboardType="number-pad"
            value={pin}
            onChangeText={setPin}
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
          />
          <TextInput
            placeholder="Confirm New PIN"
            secureTextEntry
            keyboardType="number-pad"
            value={confirm}
            onChangeText={setConfirm}
            style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
          />
          <Button title="Change PIN" onPress={onChange} />
          <View style={{ height: 8 }} />
          <Button title="Disable PIN" onPress={onDisable} />
        </>
      )}
    </View>
  );
}
