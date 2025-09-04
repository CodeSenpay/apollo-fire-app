import { claimDevice } from "@/src/services/firebaseConfig";
import { useAuth } from "@/src/state/pinGate"; // FIX: Correct import path for useAuth
import { Camera, CameraView } from "expo-camera"; // FIX: Import CameraView for the component
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

export default function AddDeviceScreen() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const getCameraPermissions = async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    };
    getCameraPermissions();
  }, []);

  const handleClaimDevice = async (deviceId: string) => {
    if (!user) return;
    try {
      await claimDevice(deviceId, user.uid);
      Alert.alert('Success', 'Device claimed successfully!');
      router.back();
    } catch (error) {
      Alert.alert('Claim Failed', 'This device might already be claimed, or an error occurred.');
      setScanned(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    if (!user) {
      Alert.alert('Error', 'You must be logged in to claim a device.');
      router.back();
      return;
    }

    Alert.alert(
      'Device Scanned!',
      `Scanned device ID: ${data}\n\nDo you want to claim this device?`,
      [
        { text: 'Cancel', onPress: () => setScanned(false), style: 'cancel' },
        {
          text: 'Claim',
          onPress: () => handleClaimDevice(data),
        },
      ]
    );
  };

  if (hasPermission === null) {
    return <Text>Requesting for camera permission</Text>;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View style={styles.container}>
      {/* FIX: Use CameraView component and onBarcodeScanned prop */}
      <CameraView
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.layerTop} />
      <View style={styles.layerCenter}>
        <View style={styles.layerLeft} />
        <View style={styles.focused} />
        <View style={styles.layerRight} />
      </View>
      <View style={styles.layerBottom}>
        <Text style={styles.text}>Scan the QR code on your device</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "column", backgroundColor: "black" },
  text: { fontSize: 18, color: "white", textAlign: "center" },
  layerTop: { flex: 2, backgroundColor: "rgba(0,0,0,0.6)" },
  layerCenter: { flex: 3, flexDirection: "row" },
  layerLeft: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  focused: {
    flex: 8,
    borderColor: "white",
    borderWidth: 2,
    borderRadius: 10,
  },
  layerRight: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  layerBottom: {
    flex: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
});

