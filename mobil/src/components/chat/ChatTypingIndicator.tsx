import React, {useEffect} from 'react';
import {View, Text} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import {colors} from '../../theme/colors';

export function ChatTypingIndicator() {
  const dot1Opacity = useSharedValue(0.3);
  const dot2Opacity = useSharedValue(0.3);
  const dot3Opacity = useSharedValue(0.3);

  useEffect(() => {
    const animateDot = (dotValue: Animated.SharedValue<number>, delay: number) => {
      dotValue.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, {duration: 400}),
            withTiming(0.3, {duration: 400}),
          ),
          -1,
          false,
        ),
      );
    };

    animateDot(dot1Opacity, 0);
    animateDot(dot2Opacity, 200);
    animateDot(dot3Opacity, 400);
  }, [dot1Opacity, dot2Opacity, dot3Opacity]);

  const dot1Style = useAnimatedStyle(() => ({
    opacity: dot1Opacity.value,
  }));

  const dot2Style = useAnimatedStyle(() => ({
    opacity: dot2Opacity.value,
  }));

  const dot3Style = useAnimatedStyle(() => ({
    opacity: dot3Opacity.value,
  }));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.card,
        alignSelf: 'flex-start',
        maxWidth: '85%',
      }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{fontSize: 16}}>🤖</Text>
      </View>
      <View style={{flexDirection: 'row', gap: 4, alignItems: 'center'}}>
        <Animated.View
          style={[
            {
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.accent,
            },
            dot1Style,
          ]}
        />
        <Animated.View
          style={[
            {
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.accent,
            },
            dot2Style,
          ]}
        />
        <Animated.View
          style={[
            {
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.accent,
            },
            dot3Style,
          ]}
        />
      </View>
      <Text style={{fontSize: 12, color: colors.textMuted}}>AI düşünüyor...</Text>
    </View>
  );
}
