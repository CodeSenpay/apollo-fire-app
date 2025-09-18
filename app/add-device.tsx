import { claimDevice, isDeviceAvailableForClaim } from "@/src/services/firebaseConfig";
import { useAuth } from "@/src/state/pinGate";
import { Buffer } from 'buffer';
import { Camera, CameraView } from "expo-camera";
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from "expo-router";
import jpeg from 'jpeg-js';
import jsQR from 'jsqr';
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// Helper function to decode QR code from a base64 image string
const decodeQrCode = (base64: string): string | null => {
  try {
    // Remove data URL prefix if present
    const cleanBase64 = base64.replace(/^data:image\/[a-z]+;base64,/, '');
    
    const rawImageData = jpeg.decode(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
    
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
  const [isProcessingGallery, setIsProcessingGallery] = useState(false);
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

  const handleBarcodeDataFound = async (data: string) => {
    if (scanned) return;
    setScanned(true);

    if (!user) {
      Alert.alert('Error', 'You must be logged in to claim a device.');
      router.back();
      return;
    }

    try {
      const isAvailable = await isDeviceAvailableForClaim(data);
      
      if (isAvailable) {
        // If it's available, prompt the user to claim it.
        Alert.alert(
          'Device Available!',
          `Do you want to claim the device with ID: ${data}?`,
          [
            { text: 'Cancel', onPress: () => setScanned(false), style: 'cancel' },
            { text: 'Claim', onPress: () => handleClaimDevice(data) },
          ]
        );
      } else {
        // If not available, show a generic error.
        Alert.alert(
          'Device Unavailable',
          'This device is either already claimed or the QR code is invalid.',
          [{ text: 'OK', onPress: () => setScanned(false) }]
        );
      }
    } catch (error: any) {
      console.error('Error during device claim process:', error);
      Alert.alert(
        'Error',
        `An error occurred: ${error.message || 'Please try again.'}`,
        [{ text: 'OK', onPress: () => setScanned(false) }]
      );
    }
  };

  const handlePickFromGallery = async () => {
    try {
      setIsProcessingGallery(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
        return;
      }

      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 1,
        base64: true, // Request base64 data
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0 && result.assets[0].base64) {
        const qrData = decodeQrCode(result.assets[0].base64);

        if (qrData) {
          handleBarcodeDataFound(qrData);
        } else {
          Alert.alert('No QR Code Found', 'We could not find a QR code in the selected image. Please try a different image.');
        }
      } else if (!result.canceled) {
        Alert.alert('Error', 'Failed to load the selected image. Please try again.');
      }
    } catch (error) {
      console.error('Error picking image from gallery:', error);
      Alert.alert('Error', 'Failed to access gallery. Please try again.');
    } finally {
      setIsProcessingGallery(false);
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
        <TouchableOpacity 
          style={[styles.galleryButton, isProcessingGallery && styles.galleryButtonDisabled]} 
          onPress={handlePickFromGallery}
          disabled={isProcessingGallery}
        >
          {isProcessingGallery ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.galleryButtonText}>Processing...</Text>
            </View>
          ) : (
            <Text style={styles.galleryButtonText}>Scan from Gallery</Text>
          )}
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
  galleryButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.7,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});