import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Canvas, Circle } from '@shopify/react-native-skia';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';

export default function App() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  
  // Reanimated Test Value
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
    // Simple pulsing animation to prove Reanimated is working
    opacity.value = withRepeat(withTiming(1, { duration: 1000 }), -1, true);
  }, [hasPermission, requestPermission, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!hasPermission) return <View style={styles.container}><Text style={styles.text}>Requesting Camera...</Text></View>;
  if (device == null) return <View style={styles.container}><Text style={styles.text}>No Camera Found.</Text></View>;

  return (
    <View style={styles.container}>
      {/* 1. Vision Camera */}
      <Camera 
        style={StyleSheet.absoluteFill} 
        device={device} 
        isActive={true} 
      />
      
      {/* 2. Skia Graphics Engine */}
      <Canvas style={StyleSheet.absoluteFill}>
        <Circle cx={150} cy={150} r={50} color="cyan" />
      </Canvas>

      {/* 3. Reanimated Overlay */}
      <Animated.View style={[styles.overlay, animatedStyle]}>
        <Text style={styles.text}>Camera + Skia + Reanimated Active</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', bottom: 50, backgroundColor: 'rgba(0,0,0,0.7)', padding: 15, borderRadius: 10 },
  text: { color: '#00FFFF', fontSize: 16, fontWeight: 'bold' }
});