import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';

/**
 * DojoDust — fire-ember sparks drifting upward.
 * Elongated streaks (real sparks aren't round), red→orange→hot-yellow,
 * accelerating rise, gentle flicker. Native-driver only.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PARTICLE_COUNT = 24;

type Spec = {
  length: number;
  thickness: number;
  startX: number;
  drift: number;
  duration: number;
  delay: number;
  peakOpacity: number;
  color: string;
  tilt: number;
};

const r = (i: number, n: number) =>
  Math.abs((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1);

function makeSpec(i: number): Spec {
  const heat = r(i, 1);
  // 55% red ember, 30% orange, 15% hot yellow-white core
  const color =
    heat < 0.55 ? '#D32F2F' :
    heat < 0.85 ? '#FF6A1A' :
                  '#FFD27A';
  const isHotCore = heat >= 0.85;
  const sway = (r(i, 4) - 0.5) * 90;
  return {
    length: 7 + r(i, 2) * 16,           // 7–23 px streaks
    thickness: 1.2 + r(i, 9) * 1.3,     // 1.2–2.5 px
    startX: r(i, 3) * SCREEN_W,
    drift: sway,
    duration: 4500 + r(i, 5) * 5500,    // 4.5–10s rise
    delay: r(i, 6) * 9000,
    peakOpacity: isHotCore
      ? 0.65 + r(i, 7) * 0.25            // hot cores: 0.65–0.90
      : 0.32 + r(i, 7) * 0.28,           // embers: 0.32–0.60
    color,
    tilt: sway > 0 ? 8 + r(i, 8) * 14 : -(8 + r(i, 8) * 14),
  };
}

function Spark({ spec }: { spec: Spec }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: spec.duration,
        delay: spec.delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, spec.delay, spec.duration]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H + 30, -60],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, spec.drift, spec.drift * 0.4],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.08, 0.25, 0.5, 0.75, 0.92, 1],
    outputRange: [
      0,
      spec.peakOpacity * 0.6,
      spec.peakOpacity,
      spec.peakOpacity * 0.7,
      spec.peakOpacity * 0.95,
      spec.peakOpacity * 0.4,
      0,
    ],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: spec.startX,
        top: 0,
        width: spec.thickness,
        height: spec.length,
        borderRadius: spec.thickness / 2,
        backgroundColor: spec.color,
        opacity,
        transform: [
          { translateY },
          { translateX },
          { rotate: `${spec.tilt}deg` },
        ],
      }}
    />
  );
}

export default function DojoDust() {
  const specs = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => makeSpec(i)),
    [],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {specs.map((s, i) => (
        <Spark key={i} spec={s} />
      ))}
    </View>
  );
}
