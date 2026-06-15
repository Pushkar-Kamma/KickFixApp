// First-launch onboarding walkthrough — a swipeable 4-slide carousel shown
// once when the user first reaches the main app. Pure-JS (built-in ScrollView),
// no native dependency. Mounted as a full-screen overlay in AppTabs.
//
// Shows automatically on first launch (via `hasSeenWalkthrough`) and can be
// re-triggered from Profile → "Replay Tutorial" (via `onReplayWalkthrough`).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  BackHandler,
  StatusBar,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius, fonts } from '../theme';
import {
  hasSeenWalkthrough,
  markWalkthroughSeen,
  onReplayWalkthrough,
} from '../lib/walkthrough';

const { width } = Dimensions.get('window');

type Slide = { step: string; title: string; body: string };

const SLIDES: Slide[] = [
  {
    step: '01',
    title: 'WELCOME TO KICKFIX',
    body: 'Your personal AI kick coach. Let’s break down your very first kick together.',
  },
  {
    step: '02',
    title: 'PICK & RECORD',
    body: 'Open the Train tab, choose a kick, and record yourself. KickFix captures every frame of the motion.',
  },
  {
    step: '03',
    title: 'GET SCORED',
    body: 'Each kick gets a 0–100 score and one focused coaching cue, so you know exactly what to work on next.',
  },
  {
    step: '04',
    title: 'TRACK PROGRESS',
    body: 'Your dashboard, kick history, and fighter attributes grow stronger every time you train.',
  },
];

export default function Walkthrough() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const mounted = useRef(true);

  // Auto-show on first launch; re-show on replay request.
  useEffect(() => {
    mounted.current = true;
    hasSeenWalkthrough().then(seen => {
      if (mounted.current && !seen) setVisible(true);
    });
    const unsub = onReplayWalkthrough(() => {
      if (!mounted.current) return;
      setIndex(0);
      setVisible(true);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ x: 0, animated: false }),
      );
    });
    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  const finish = useCallback(() => {
    setVisible(false);
    markWalkthroughSeen();
  }, []);

  // Hardware back dismisses the overlay rather than navigating away.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish();
      return true;
    });
    return () => sub.remove();
  }, [visible, finish]);

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, i));
    setIndex(clamped);
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
  }, []);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex(i);
    },
    [],
  );

  if (!visible) return null;

  const isLast = index === SLIDES.length - 1;

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Skip */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={finish}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}>
          <Text style={styles.skip}>SKIP</Text>
        </TouchableOpacity>
      </View>

      {/* Slides */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.scroll}>
        {SLIDES.map(s => (
          <View key={s.step} style={[styles.slide, { width }]}>
            <Text style={styles.step}>{s.step}</Text>
            <View style={styles.accentBar} />
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Progress dots */}
      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.step} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {/* CTA */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => (isLast ? finish() : goTo(index + 1))}
          activeOpacity={0.85}>
          <Text style={styles.ctaText}>{isLast ? 'START TRAINING' : 'NEXT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    zIndex: 100,
  },
  header: {
    paddingHorizontal: spacing.lg,
    alignItems: 'flex-end',
  },
  skip: {
    fontFamily: fonts.oswaldBold,
    fontSize: 14,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  scroll: { flex: 1 },
  slide: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  step: {
    fontFamily: fonts.montserratBlack,
    fontSize: 64,
    color: colors.cardElevated,
    letterSpacing: -2,
  },
  accentBar: {
    width: 48,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.montserratBlack,
    fontSize: 30,
    color: colors.white,
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fonts.interRegular,
    fontSize: 17,
    color: colors.textSecondary,
    lineHeight: 26,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cardElevated,
    marginHorizontal: 4,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 22,
  },
  footer: {
    paddingHorizontal: spacing.xl,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.montserratBold,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 1,
  },
});
