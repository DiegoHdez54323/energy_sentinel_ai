import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BrandMark } from '@/components/brand/brand-mark';
import { ScreenBackground } from '@/components/ui/screen-background';
import { AppColors, AppSpacing, AppTypography } from '@/constants/design';
import { useAuth } from '@/features/auth/auth-provider';

const DOT_DELAYS = [0, 200, 400] as const;

export default function SplashScreen() {
  const [phase, setPhase] = useState<'logo' | 'text' | 'exit'>('logo');
  const [canLeave, setCanLeave] = useState(false);
  const { status } = useAuth();

  useEffect(() => {
    const textTimer = setTimeout(() => setPhase('text'), 600);
    const leaveTimer = setTimeout(() => setCanLeave(true), 2000);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(leaveTimer);
    };
  }, []);

  useEffect(() => {
    if (!canLeave || status === 'bootstrapping' || phase === 'exit') {
      return;
    }

    const destination = status === 'authenticated' ? '/home' : '/login';
    setPhase('exit');

    const navigationTimer = setTimeout(() => {
      router.replace(destination);
    }, 600);

    return () => {
      clearTimeout(navigationTimer);
    };
  }, [canLeave, phase, status]);

  return (
    <ScreenBackground variant="energy">
      {phase !== 'exit' ? (
        <Animated.View exiting={FadeOut.duration(500)} style={styles.container}>
          <Animated.View entering={FadeInUp.springify().damping(15).stiffness(200)}>
            <BrandMark iconSize={48} size={96} variant="frosted" />
          </Animated.View>

          {phase === 'text' ? (
            <>
              <Animated.View entering={FadeInUp.duration(500)} style={styles.textBlock}>
                <Text style={styles.title}>Energy Sentinel</Text>
                <Text style={styles.subtitle}>Monitoreo inteligente de energia</Text>
              </Animated.View>

              <Animated.View entering={FadeInUp.duration(500)} style={styles.loader}>
                {DOT_DELAYS.map((delay) => (
                  <LoaderDot delay={delay} key={delay} visible />
                ))}
              </Animated.View>
            </>
          ) : null}
        </Animated.View>
      ) : null}
    </ScreenBackground>
  );
}

function LoaderDot({ delay, visible }: { delay: number; visible: boolean }) {
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = visible
      ? withRepeat(
          withDelay(
            delay,
            withSequence(withTiming(1, { duration: 500 }), withTiming(0.3, { duration: 500 }))
          ),
          -1,
          false
        )
      : withTiming(0, { duration: 200 });
  }, [delay, opacity, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBlock: {
    marginTop: AppSpacing.xl,
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: AppTypography.heroSize,
    fontWeight: AppTypography.bold,
  },
  subtitle: {
    marginTop: AppSpacing.xs,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: AppTypography.smallSize,
    fontWeight: AppTypography.regular,
  },
  loader: {
    position: 'absolute',
    bottom: 80,
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: AppColors.loaderDot,
  },
});
