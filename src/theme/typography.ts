import { TextStyle } from 'react-native';
import { colors } from './colors';

export const fonts = {
  montserratBlack: 'Montserrat-Black',
  montserratExtraBold: 'Montserrat-ExtraBold',
  montserratBold: 'Montserrat-Bold',
  montserratRegular: 'Montserrat-Regular',
  oswaldBold: 'Oswald-Bold',
  oswaldRegular: 'Oswald-Regular',
  interBold: 'Inter_28pt-Bold',
  interMedium: 'Inter_24pt-Medium',
  interRegular: 'Inter_24pt-Regular',
} as const;

export const typography: Record<string, TextStyle> = {
  h1: {
    fontSize: 32,
    fontFamily: fonts.montserratExtraBold,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontFamily: fonts.oswaldBold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 20,
    fontFamily: fonts.oswaldBold,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 16,
    fontFamily: fonts.interRegular,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  bodyBold: {
    fontSize: 16,
    fontFamily: fonts.interBold,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 13,
    fontFamily: fonts.oswaldRegular,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  stat: {
    fontSize: 36,
    fontFamily: fonts.montserratExtraBold,
    color: colors.textPrimary,
  },
  scoreTraining: {
    fontSize: 96,
    fontFamily: fonts.montserratBlack,
    color: colors.textPrimary,
  },
  button: {
    fontSize: 16,
    fontFamily: fonts.montserratBold,
    letterSpacing: 1,
  },
};
