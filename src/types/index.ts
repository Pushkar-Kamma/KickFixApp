export type KickMode = 'Roundhouse' | 'Side Kick' | 'Front Snap';
export type AppState = 'IDLE' | 'RECORDING' | 'ANALYZING';

/* ── Supabase table types (match DB schema exactly) ── */

export interface DbProfile {
  id: string;
  username: string | null;
  belt_level: string | null;
  created_at: string;
  height_cm: number | null;
}

export interface DbSession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  total_kicks: number | null;
  good_kicks: number | null;
  bad_kicks: number | null;
  max_streak: number | null;
  kick_mode: string | null;
}

export interface EngineData {
  score: number;
  feedback: string[];
  errors: string[];
  leg: 'Left' | 'Right';
  peakAngle: number;
  kickMode: KickMode;
  /** Optional rich data for fighter-attribute scoring. Older saved kicks may lack these. */
  passedCriteria?: string[];
  metrics?: {
    peakKneeAngularVelDegPerSec?: number;
    peakFootSpeedMS?: number;
    extensionMs?: number;
    chamberMs?: number;
    totalMs?: number;
    recoilToExtensionRatio?: number;
  };
}

export interface DbKick {
  id: string;
  user_id: string;
  session_id: string;
  created_at: string;
  kick_type: string;
  engine_data: EngineData;
}

/* ── Legacy local types (still used by CameraScreen state) ── */

export interface KickResult {
  type: KickMode;
  leg: 'Left' | 'Right';
  feedback: string[];
  errors: string[];
  score: number;
  timestamp: number;
}

export interface KickSession {
  id: string;
  userId: string;
  mode: KickMode;
  totalKicks: number;
  goodKicks: number;
  results: KickResult[];
  createdAt: string;
}

/* ── Navigation param lists ── */

export type RootStackParamList = {
  Auth: undefined;
  ProfileSetup: undefined;
  MainTabs: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
  OTP: { email: string };
  ForgotPassword: undefined;
  ForgotPasswordOTP: { email: string };
  NewPassword: { email: string };
  PasswordUpdated: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Train: undefined;
  ProfileTab: undefined;
};

export type HomeStackParamList = {
  Dashboard: undefined;
  SetGoals: undefined;
  KickHistory: undefined;
  FighterAttributes: undefined;
};

export type AnalysisMode = 'Quick' | 'Full';

export type TrainStackParamList = {
  TrainSelect: undefined;
  Camera: { kickMode: KickMode; analysisMode?: AnalysisMode };
  KickReview: { kickId: string };
};

/* ── Kick frame storage (compact, for replay) ── */
/** Compact landmark: [x, y, z, visibility, presence], rounded to 4 decimals. */
export type CompactLandmark = [number, number, number, number, number];
/** A frame stored compactly. */
export interface CompactFrame {
  /** image-space landmarks */
  i: CompactLandmark[];
  /** world-space landmarks */
  w: CompactLandmark[];
  /** relative timestamp ms from kick start */
  t: number;
}
export interface DbKickFrames {
  id: string;
  kick_id: string;
  user_id: string;
  created_at: string;
  frames: CompactFrame[];
  peak_frame_idx: number;
  chamber_frame_idx: number;
  leg: 'Left' | 'Right';
}

export type ProfileStackParamList = {
  Profile: undefined;
  EditUsername: undefined;
  EditProfile: undefined;
};
