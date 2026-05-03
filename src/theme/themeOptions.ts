import { TextStyle } from 'react-native';

/* ── THEME A: Red + Black + White (Combat) ── */

export const colorsA = {
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceLight: '#242424',
  card: '#1A1A1A',
  cardBorder: '#2A2A2A',

  primary: '#E53935',
  primaryDim: '#B71C1C',
  primaryTint: 'rgba(229, 57, 53, 0.12)',
  primaryTintBorder: 'rgba(229, 57, 53, 0.30)',
  accent: '#4CAF50',
  warning: '#FFB300',
  error: '#FF1744',
  success: '#4CAF50',

  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',

  tabBarBackground: '#0D0D0D',
  tabBarBorder: '#1A1A1A',
  tabBarInactive: '#666666',

  scoreGood: '#4CAF50',
  scoreMid: '#FFB300',
  scoreBad: '#FF1744',
} as const;

/* ── THEME B: Monochrome Futuristic (Black + White) ── */

export const colorsB = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceLight: '#1E1E1E',
  card: '#161616',
  cardBorder: '#2C2C2C',

  primary: '#FFFFFF',
  primaryDim: '#B0B0B0',
  accent: '#E0E0E0',
  warning: '#FFB300',
  error: '#FF1744',
  success: '#4CAF50',

  textPrimary: '#FFFFFF',
  textSecondary: '#8A8A8A',
  textMuted: '#555555',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',

  tabBarBackground: '#0A0A0A',
  tabBarBorder: '#1C1C1C',
  tabBarInactive: '#555555',

  scoreGood: '#4CAF50',
  scoreMid: '#FFB300',
  scoreBad: '#FF1744',
} as const;
