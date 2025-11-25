import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { safeHaptics } from '../../utils/haptics';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
  visible: boolean;
}

export function QRScanner({ onScan, onClose, visible }: QRScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) {
      requestCameraPermission();
    }
  }, [visible]);

  const requestCameraPermission = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;

    setScanned(true);
    safeHaptics.notification(Haptics.NotificationFeedbackType.Success);

    // Extract game code from QR data (URL or direct code)
    let gameCode = data;

    // If it's a URL, extract the code parameter
    try {
      const url = new URL(data);
      const codeParam = url.searchParams.get('code');
      if (codeParam) {
        gameCode = codeParam;
      }
    } catch {
      // Not a URL, use as-is
    }

    onScan(gameCode.toUpperCase());
    setTimeout(() => {
      onClose();
      setScanned(false);
    }, 500);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {hasPermission === null && (
          <View style={styles.messageContainer}>
            <Text style={styles.message}>طلب إذن الكاميرا...</Text>
            <Text style={styles.messageEn}>Requesting camera permission...</Text>
          </View>
        )}

        {hasPermission === false && (
          <View style={styles.messageContainer}>
            <Text style={styles.message}>لا يمكن الوصول إلى الكاميرا</Text>
            <Text style={styles.messageEn}>Camera access denied</Text>
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>إغلاق • Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {hasPermission === true && (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
            >
              <View style={styles.overlay}>
                <View style={styles.topOverlay} />
                <View style={styles.middleRow}>
                  <View style={styles.sideOverlay} />
                  <View style={styles.scanArea}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />
                  </View>
                  <View style={styles.sideOverlay} />
                </View>
                <View style={styles.bottomOverlay}>
                  <Text style={styles.instruction}>
                    قم بتوجيه الكاميرا إلى رمز QR
                  </Text>
                  <Text style={styles.instructionEn}>
                    Point camera at QR code
                  </Text>
                </View>
              </View>
            </CameraView>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  messageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  message: {
    fontSize: 20,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageEn: {
    fontSize: 16,
    color: '#a78bfa',
    textAlign: 'center',
    marginBottom: 24,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  topOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    height: 250,
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanArea: {
    width: 250,
    height: 250,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#ffffff',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  instruction: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  instructionEn: {
    fontSize: 14,
    color: '#a78bfa',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
