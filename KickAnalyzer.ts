// KickAnalyzer.ts

export const JOINTS = {
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_WRIST: 15,    RIGHT_WRIST: 16,
    LEFT_HIP: 23,      RIGHT_HIP: 24,
    LEFT_KNEE: 25,     RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,     RIGHT_HEEL: 30,
    LEFT_TOE: 31,      RIGHT_TOE: 32
  };
  
  export interface Point { x: number; y: number; visibility?: number; }
  
  export const calculateAngle = (a: Point, b: Point, c: Point): number => {
    if (!a || !b || !c) return 0;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return Math.round(angle);
  };
  
  export const calculateDistance = (p1: Point, p2: Point): number => {
    if (!p1 || !p2) return 0;
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };
  
  export const checkGuard = (lm: Point[], kWrist: number, sWrist: number, shouldersY: number): boolean => {
    if (!lm[kWrist] || !lm[sWrist]) return false;
    return (lm[kWrist].y < shouldersY) || (lm[sWrist].y < shouldersY);
  };
  
  // --- ANALYSIS ENGINES ---
  
  export const analyzeRoundhouse = (chamberFrame: Point[], apexFrame: Point[], activeLeg: 'Left' | 'Right') => {
    const isLeft = activeLeg === 'Left';
    const kHip = isLeft ? JOINTS.LEFT_HIP : JOINTS.RIGHT_HIP;
    const kKnee = isLeft ? JOINTS.LEFT_KNEE : JOINTS.RIGHT_KNEE;
    const kAnkle = isLeft ? JOINTS.LEFT_ANKLE : JOINTS.RIGHT_ANKLE;
    const sHip = isLeft ? JOINTS.RIGHT_HIP : JOINTS.LEFT_HIP;
    const kWrist = isLeft ? JOINTS.LEFT_WRIST : JOINTS.RIGHT_WRIST;
    const sWrist = isLeft ? JOINTS.RIGHT_WRIST : JOINTS.LEFT_WRIST;
  
    let feedback: string[] = [];
    let errors: string[] = [];
    const thighLength = calculateDistance(apexFrame[kHip], apexFrame[kKnee]);
  
    // 1. Guard Check
    const shouldersY = Math.min(apexFrame[JOINTS.LEFT_SHOULDER].y, apexFrame[JOINTS.RIGHT_SHOULDER].y);
    if (!checkGuard(apexFrame, kWrist, sWrist, shouldersY)) {
      feedback.push("Hands Dropped!");
      errors.push("Dropped Guard");
    }
  
    // 2. Extension
    const maxAngle = calculateAngle(apexFrame[kHip], apexFrame[kKnee], apexFrame[kAnkle]);
    if (maxAngle < 160) {
      feedback.push(`Bad Extension: ${maxAngle}°`);
      errors.push("Poor Extension");
    } else {
      feedback.push(`Great Snap! ${maxAngle}°`);
    }
  
    // 3. Hip Turnover
    const turnoverThreshold = thighLength * 0.15;
    if (apexFrame[kHip].y > apexFrame[sHip].y + turnoverThreshold) {
      feedback.push("Turn Hips Over!");
      errors.push("No Hip Turnover");
    }
  
    // 4. Shin Level
    const shinYDiff = Math.abs(apexFrame[kAnkle].y - apexFrame[kKnee].y);
    if (shinYDiff > (thighLength * 0.3)) {
      feedback.push("Level your shin!");
      errors.push("Shin not horizontal");
    }
  
    if (errors.length === 0) feedback.push("PERFECT KICK!");
  
    return { type: "Roundhouse", leg: activeLeg, feedback, errors };
  };
  
  export const analyzeSideKick = (chamberFrame: Point[], apexFrame: Point[], activeLeg: 'Left' | 'Right') => {
    const isLeft = activeLeg === 'Left';
    const kHip = isLeft ? JOINTS.LEFT_HIP : JOINTS.RIGHT_HIP;
    const kKnee = isLeft ? JOINTS.LEFT_KNEE : JOINTS.RIGHT_KNEE;
    const kAnkle = isLeft ? JOINTS.LEFT_ANKLE : JOINTS.RIGHT_ANKLE;
    const kHeel = isLeft ? JOINTS.LEFT_HEEL : JOINTS.RIGHT_HEEL;
    const kToe = isLeft ? JOINTS.LEFT_TOE : JOINTS.RIGHT_TOE;
  
    let feedback: string[] = [];
    let errors: string[] = [];
  
    const maxAngle = calculateAngle(apexFrame[kHip], apexFrame[kKnee], apexFrame[kAnkle]);
    
    if (maxAngle < 170) {
      feedback.push(`Push Harder! Only ${maxAngle}°`);
      errors.push("Poor Extension");
    } else {
      feedback.push(`Solid Lockout: ${maxAngle}°`);
    }
  
    const footLength = calculateDistance(apexFrame[kHeel], apexFrame[kToe]);
    const bladeThreshold = footLength * 0.10; 
  
    if (apexFrame[kHeel].y > apexFrame[kToe].y + bladeThreshold) {
      feedback.push("Turn Toes Down (Blade)!");
      errors.push("Toes Pointing Up");
    }
  
    if (errors.length === 0) feedback.push("PERFECT KICK!");
  
    return { type: "Side Kick", leg: activeLeg, feedback, errors };
  };
  
  export const analyzeFrontSnap = (chamberFrame: Point[], apexFrame: Point[], activeLeg: 'Left' | 'Right') => {
    const isLeft = activeLeg === 'Left';
    const kHip = isLeft ? JOINTS.LEFT_HIP : JOINTS.RIGHT_HIP;
    const kKnee = isLeft ? JOINTS.LEFT_KNEE : JOINTS.RIGHT_KNEE;
    const kAnkle = isLeft ? JOINTS.LEFT_ANKLE : JOINTS.RIGHT_ANKLE;
    const kWrist = isLeft ? JOINTS.LEFT_WRIST : JOINTS.RIGHT_WRIST;
    const sWrist = isLeft ? JOINTS.RIGHT_WRIST : JOINTS.LEFT_WRIST;
  
    let feedback: string[] = [];
    let errors: string[] = [];
  
    // 1. Guard
    const shouldersY = Math.min(apexFrame[JOINTS.LEFT_SHOULDER].y, apexFrame[JOINTS.RIGHT_SHOULDER].y);
    if (!checkGuard(apexFrame, kWrist, sWrist, shouldersY)) {
      feedback.push("Hands Dropped!");
      errors.push("Dropped Guard");
    }
  
    // 2. Extension
    const maxAngle = calculateAngle(apexFrame[kHip], apexFrame[kKnee], apexFrame[kAnkle]);
    if (maxAngle < 170) {
      feedback.push(`Snap Leg! (${maxAngle}°)`);
      errors.push("Poor Extension");
    } else {
      feedback.push("Good Snap.");
    }
  
    // 3. Knee Height (Must be above hip)
    if (apexFrame[kKnee].y > apexFrame[kHip].y) {
      feedback.push("Lift Knee Higher!");
      errors.push("Low Knee");
    }
  
    if (errors.length === 0) feedback.push("PERFECT KICK!");
  
    return { type: "Front Snap", leg: activeLeg, feedback, errors };
  };