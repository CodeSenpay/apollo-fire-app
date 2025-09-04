import { claimDevice } from "@/src/services/firebaseConfig";
import { useAuth } from "@/src/state/pinGate";
import { Camera, CameraView } from "expo-camera";
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from "expo-router";
import jpeg from 'jpeg-js';
import jsQR from 'jsqr';
import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Helper function to decode QR code from a base64 image string
const decodeQrCode = (base64: string): string | null => {
  try {
    const rawImageData = jpeg.decode(Buffer.from(base64, 'base64'), { useTArray: true });
    // Ensure the data is a Uint8ClampedArray for jsQR
    const imageData = new Uint8ClampedArray(rawImageData.data.buffer);
    const code = jsQR(imageData, rawImageData.width, rawImageData.height);
    return code?.data || null;
  } catch (error) {
    console.error("Could not decode QR code:", error);
    return null;
  }
  };


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

  const handleBarcodeDataFound = (data: string) => {
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
        { text: 'Claim', onPress: () => handleClaimDevice(data) },
      ]
    );
  };

  const handlePickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      base64: true, // Request base64 data
    });

    if (!result.canceled && result.assets[0].base64) {
      const qrData = decodeQrCode(result.assets[0].base64);

      if (qrData) {
        handleBarcodeDataFound(qrData);
      } else {
        Alert.alert('No QR Code Found', 'We could not find a QR code in the selected image.');
      }
    }
  };


  if (hasPermission === null) {
    return <Text>Requesting for camera permission</Text>;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <View style={styles.container}>
      <CameraView
        onBarcodeScanned={scanned ? undefined : (e) => handleBarcodeDataFound(e.data)}
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
        <TouchableOpacity style={styles.galleryButton} onPress={handlePickFromGallery}>
          <Text style={styles.galleryButtonText}>Scan from Gallery</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "column", backgroundColor: "black" },
  text: { fontSize: 18, color: "white", textAlign: "center", marginBottom: 20 },
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
  galleryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 20,
  },
  galleryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});