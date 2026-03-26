import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Dimensions, TouchableOpacity, Text, PermissionsAndroid, Platform } from 'react-native';
import { RNMediapipe, switchCamera } from '@thinksys/react-native-mediapipe';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [hasPermission, setHasPermission] = useState(false);

  // Ask Android for camera permission the standard way
  useEffect(() => {
    const requestCameraPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera Permission",
            message: "KickFix needs your camera to track your kicks.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        setHasPermission(true);
      }
    };

    requestCameraPermission();
  }, []);

  const handleLandmarks = (data: any) => {
    // We will use this later!
    // console.log('Body Landmark Data:', data);
  };

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Waiting for Camera Permission...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* The Native Component doing all the heavy lifting */}
      <RNMediapipe 
        width={width} 
        height={height} 
        
        // Turn on the skeleton drawing
        face={true} 
        leftArm={true} 
        rightArm={true} 
        leftWrist={true} 
        rightWrist={true} 
        torso={true} 
        leftLeg={true} 
        rightLeg={true} 
        leftAnkle={true} 
        rightAnkle={true} 
        
        onLandmark={handleLandmarks} 
      />

      <View style={styles.uiOverlay}>
        <TouchableOpacity onPress={() => switchCamera()} style={styles.button}>
          <Text style={styles.buttonText}>Flip Camera</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'black' },
  text: { color: 'white', fontSize: 16 },
  uiOverlay: {
    position: 'absolute',
    bottom: 50,
    width: '100%',
    alignItems: 'center',
  },
  button: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'white',
  },
  buttonText: { color: 'white', fontWeight: 'bold' }
});