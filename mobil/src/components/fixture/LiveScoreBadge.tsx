import React, {useEffect} from 'react';
import {Text, View, StyleSheet} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import type {FixtureScore, FixtureState} from '../../types/api';
import {colors} from '../../theme/colors';

type Props = {
  isLive: boolean;
  scores?: FixtureScore;
  state?: FixtureState;
  status?: string;
  compact?: boolean;
};

const getMatchPeriod = (status?: string, state?: FixtureState): string => {
  if (!status) return '';
  
  const statusLower = status.toLowerCase();
  const stateValue = state?.state?.toLowerCase() || '';
  
  // Live statuses
  if (statusLower.includes('1st half') || stateValue.includes('1st')) {
    return '1st Half';
  }
  if (statusLower.includes('2nd half') || stateValue.includes('2nd')) {
    return '2nd Half';
  }
  if (statusLower.includes('halftime') || stateValue.includes('halftime') || stateValue.includes('ht')) {
    return 'HT';
  }
  if (statusLower.includes('extra') || stateValue.includes('et')) {
    return 'ET';
  }
  if (statusLower.includes('break')) {
    return 'Break';
  }
  
  // Finished statuses
  if (statusLower.includes('ft') || statusLower.includes('finished') || statusLower.includes('ended')) {
    return 'FT';
  }
  
  return '';
};

const formatMinute = (state?: FixtureState): string => {
  if (!state?.minute) return '';
  
  const minute = state.minute;
  const addedTime = state.added_time || 0;
  
  if (addedTime > 0) {
    return `${minute}+${addedTime}'`;
  }
  
  return `${minute}'`;
};

export function LiveScoreBadge({isLive, scores, state, status, compact = false}: Props) {
  const pulseAnim = useSharedValue(0);
  
  useEffect(() => {
    if (isLive) {
      pulseAnim.value = withRepeat(
        withTiming(1, {
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
    } else {
      pulseAnim.value = 0;
    }
  }, [isLive]);
  
  const pulseStyle = useAnimatedStyle(() => {
    const opacity = interpolate(pulseAnim.value, [0, 1], [1, 0.4]);
    const scale = interpolate(pulseAnim.value, [0, 1], [1, 1.1]);
    
    return {
      opacity,
      transform: [{scale}],
    };
  });
  
  const homeScore = scores?.home_score ?? 0;
  const awayScore = scores?.away_score ?? 0;
  const period = getMatchPeriod(status, state);
  const minute = formatMinute(state);
  const showScore = scores && (homeScore > 0 || awayScore > 0 || isLive);
  
  // If not live and no scores, don't render
  if (!isLive && !showScore) {
    return null;
  }
  
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        {isLive && (
          <Animated.View style={[styles.liveDot, pulseStyle]} />
        )}
        {showScore && (
          <Text style={styles.compactScore}>
            {homeScore} - {awayScore}
          </Text>
        )}
        {period && (
          <Text style={styles.compactPeriod}>{period}</Text>
        )}
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Live indicator with pulsing animation */}
      {isLive && (
        <View style={styles.liveRow}>
          <Animated.View style={[styles.liveBadge, pulseStyle]}>
            <View style={styles.liveDotLarge} />
            <Text style={styles.liveText}>LIVE</Text>
          </Animated.View>
          {minute && (
            <Text style={styles.minuteText}>{minute}</Text>
          )}
        </View>
      )}
      
      {/* Score display */}
      {showScore && (
        <View style={styles.scoreRow}>
          <Text style={styles.scoreText}>
            {homeScore} - {awayScore}
          </Text>
          {period && !isLive && (
            <Text style={styles.periodText}>{period}</Text>
          )}
        </View>
      )}
      
      {/* Period indicator for non-live matches */}
      {period && !isLive && showScore && (
        <Text style={styles.statusText}>{period}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  liveDotLarge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  minuteText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  periodText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    backgroundColor: colors.line,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  compactScore: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  compactPeriod: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
