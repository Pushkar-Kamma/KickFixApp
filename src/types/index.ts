export type KickMode = 'Roundhouse' | 'Side Kick' | 'Front Snap';
export type AppState = 'IDLE' | 'RECORDING' | 'ANALYZING';

export interface KickResult {
  type: KickMode;
  leg: 'Left' | 'Right';
  feedback: string[];
  errors: string[];
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

export type RootStackParamList = {
  Auth: undefined;
  MainTabs: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Camera: undefined;
  Profile: undefined;
};
