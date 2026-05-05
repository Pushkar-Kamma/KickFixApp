/**
 * SkeletonReplay — renders a MediaPipe pose skeleton frame as SVG.
 * Stateless: parent controls which frame to show.
 */

import React from 'react';
import Svg, { Line, Circle } from 'react-native-svg';
import { J, type Landmark } from '../engine/biomech';
import { colors } from '../theme';

const CONNECTIONS: [number, number][] = [
  // Torso
  [J.L_SHOULDER, J.R_SHOULDER],
  [J.L_SHOULDER, J.L_HIP],
  [J.R_SHOULDER, J.R_HIP],
  [J.L_HIP, J.R_HIP],
  // Left arm
  [J.L_SHOULDER, J.L_ELBOW],
  [J.L_ELBOW, J.L_WRIST],
  // Right arm
  [J.R_SHOULDER, J.R_ELBOW],
  [J.R_ELBOW, J.R_WRIST],
  // Left leg
  [J.L_HIP, J.L_KNEE],
  [J.L_KNEE, J.L_ANKLE],
  [J.L_ANKLE, J.L_HEEL],
  [J.L_HEEL, J.L_FOOT_INDEX],
  [J.L_ANKLE, J.L_FOOT_INDEX],
  // Right leg
  [J.R_HIP, J.R_KNEE],
  [J.R_KNEE, J.R_ANKLE],
  [J.R_ANKLE, J.R_HEEL],
  [J.R_HEEL, J.R_FOOT_INDEX],
  [J.R_ANKLE, J.R_FOOT_INDEX],
];

const KEY_JOINTS = [
  J.L_HIP, J.R_HIP, J.L_KNEE, J.R_KNEE,
  J.L_ANKLE, J.R_ANKLE, J.L_FOOT_INDEX, J.R_FOOT_INDEX,
  J.L_SHOULDER, J.R_SHOULDER, J.L_WRIST, J.R_WRIST,
];

interface Props {
  landmarks: Landmark[];   // image-space, x,y in [0,1]
  width: number;
  height: number;
  /** Highlight one leg in red (e.g. the kicking leg). */
  highlightLeg?: 'Left' | 'Right' | null;
  /** Optional: extra annotations to overlay (e.g. angle labels). */
  showJointDots?: boolean;
}

export default function SkeletonReplay({
  landmarks, width, height, highlightLeg = null, showJointDots = true,
}: Props) {
  if (!landmarks || landmarks.length < 33) return null;

  const isHighlightConnection = (a: number, b: number): boolean => {
    if (!highlightLeg) return false;
    const set: number[] = highlightLeg === 'Left'
      ? [J.L_HIP, J.L_KNEE, J.L_ANKLE, J.L_HEEL, J.L_FOOT_INDEX]
      : [J.R_HIP, J.R_KNEE, J.R_ANKLE, J.R_HEEL, J.R_FOOT_INDEX];
    return set.includes(a) && set.includes(b);
  };

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      {CONNECTIONS.map(([a, b], idx) => {
        const pa = landmarks[a];
        const pb = landmarks[b];
        if (!pa || !pb) return null;
        const highlight = isHighlightConnection(a, b);
        return (
          <Line
            key={`line-${idx}`}
            x1={pa.x * width} y1={pa.y * height}
            x2={pb.x * width} y2={pb.y * height}
            stroke={highlight ? colors.primary : colors.white}
            strokeWidth={highlight ? 3.5 : 2.5}
            strokeLinecap="round"
            opacity={0.95}
          />
        );
      })}

      {showJointDots && KEY_JOINTS.map(i => {
        const p = landmarks[i];
        if (!p) return null;
        return (
          <Circle
            key={`dot-${i}`}
            cx={p.x * width} cy={p.y * height}
            r={4}
            fill={colors.primary}
            stroke={colors.white}
            strokeWidth={1.5}
          />
        );
      })}
    </Svg>
  );
}
