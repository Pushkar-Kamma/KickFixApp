/**
 * AttributeRadar — 6-axis martial arts attribute hexagon (radar/spider chart).
 * Pure SVG. Renders both the background hex grid AND the user's score polygon.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Line, Circle } from 'react-native-svg';
import { colors, fonts } from '../theme';

export interface RadarAxis {
  label: string;
  value: number; // 0–100
}

interface Props {
  axes: RadarAxis[];        // Must be exactly 6 for a hexagon
  size: number;             // overall canvas size (square)
  overall: number | null;   // shown in center; null = hidden
  showLabels?: boolean;
}

export default function AttributeRadar({ axes, size, overall, showLabels = true }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const labelPad = showLabels ? 30 : 0;
  const radius = size / 2 - labelPad;

  // 6 axes, starting from top (12 o'clock), going clockwise
  const angles = axes.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / 6);

  const polarToXY = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  });

  // Background grid: 4 nested hexagons at 25/50/75/100% radius
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridHexes = gridLevels.map(level =>
    angles
      .map(a => {
        const p = polarToXY(a, radius * level);
        return `${p.x},${p.y}`;
      })
      .join(' '),
  );

  // Spokes
  const spokes = angles.map(a => {
    const p = polarToXY(a, radius);
    return { x1: cx, y1: cy, x2: p.x, y2: p.y };
  });

  // Value polygon
  const valuePoints = axes
    .map((axis, i) => {
      const r = radius * Math.max(0, Math.min(1, axis.value / 100));
      const p = polarToXY(angles[i], r);
      return `${p.x},${p.y}`;
    })
    .join(' ');

  // Label positions (just outside the outer hex)
  const labelPositions = axes.map((axis, i) => {
    const p = polarToXY(angles[i], radius + 14);
    return { x: p.x, y: p.y, label: axis.label };
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background grid */}
        {gridHexes.map((points, i) => (
          <Polygon
            key={i}
            points={points}
            fill="none"
            stroke={colors.cardBorder}
            strokeWidth={1}
            opacity={i === gridHexes.length - 1 ? 0.7 : 0.35}
          />
        ))}
        {/* Spokes */}
        {spokes.map((s, i) => (
          <Line
            key={`spoke-${i}`}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={colors.cardBorder}
            strokeWidth={1}
            opacity={0.35}
          />
        ))}
        {/* Value polygon */}
        <Polygon
          points={valuePoints}
          fill={colors.primary}
          fillOpacity={0.30}
          stroke={colors.primary}
          strokeWidth={2}
        />
        {/* Vertices */}
        {axes.map((axis, i) => {
          const r = radius * Math.max(0, Math.min(1, axis.value / 100));
          const p = polarToXY(angles[i], r);
          return (
            <Circle
              key={`v-${i}`}
              cx={p.x} cy={p.y} r={3}
              fill={colors.primary}
              stroke={colors.white}
              strokeWidth={1}
            />
          );
        })}
      </Svg>

      {/* Center overall score */}
      {overall !== null && (
        <View pointerEvents="none" style={[styles.centerText, { width: size, height: size }]}>
          <Text style={styles.overallNum}>{overall}</Text>
          <Text style={styles.overallLabel}>Overall</Text>
        </View>
      )}

      {/* Axis labels */}
      {showLabels && labelPositions.map((p, i) => (
        <Text
          key={`lbl-${i}`}
          style={[
            styles.axisLabel,
            { left: p.x - 60, top: p.y - 9, width: 120 },
          ]}
          numberOfLines={1}>
          {p.label}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative' },
  centerText: {
    position: 'absolute', top: 0, left: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  overallNum: {
    fontFamily: fonts.montserratBlack, fontSize: 36, color: colors.white,
    includeFontPadding: false,
  },
  overallLabel: {
    fontFamily: fonts.oswaldRegular, fontSize: 12, color: colors.textMuted,
    letterSpacing: 1.2, marginTop: 2,
  },
  axisLabel: {
    position: 'absolute',
    fontFamily: fonts.oswaldBold, fontSize: 11, color: colors.textSecondary,
    letterSpacing: 1.2, textAlign: 'center',
  },
});
