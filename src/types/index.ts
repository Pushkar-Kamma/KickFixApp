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
};

export type AnalysisMode = 'Quick' | 'Full';

export type TrainStackParamList = {
  TrainSelect: undefined;
  Camera: { kickMode: KickMode; analysisMode?: AnalysisMode };
};

export type ProfileStackParamList = {
  Profile: undefined;
  EditUsername: undefined;
  EditProfile: undefined;
};
