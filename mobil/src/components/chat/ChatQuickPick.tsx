import React from 'react';
import {Pressable, Text, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {colors} from '../../theme/colors';
import {oddText} from '../../utils/format';

type QuickPickTone = 'high' | 'low' | 'neutral';

type Props = {
  selection: string;
  selectionDisplay?: string;
  odd: number;
  tone: QuickPickTone;
  onPress: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChatQuickPick({selection, selectionDisplay, odd, tone, onPress}: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, {damping: 15, stiffness: 300});
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, {damping: 15, stiffness: 300});
  };

  const toneConfig = {
    high: {
      colors: [colors.successSoft, colors.successSoftStrong],
      borderColor: colors.successBorder,
      icon: 'trending-up' as const,
      iconColor: colors.success,
      label: 'Güçlü',
    },
    low: {
      colors: [colors.dangerSoft, colors.dangerSoftStrong],
      borderColor: colors.dangerBorder,
      icon: 'trending-down' as const,
      iconColor: colors.danger,
      label: 'Zayıf',
    },
    neutral: {
      colors: [colors.surface, colors.cardSoft],
      borderColor: colors.lineStrong,
      icon: 'remove' as const,
      iconColor: colors.textMuted,
      label: 'Nötr',
    },
  };

  const config = toneConfig[tone];
  const displayText = selectionDisplay || (selection === '0' ? 'X' : selection);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        {
          flex: 1,
          minWidth: 100,
          maxWidth: 120,
          borderRadius: 12,
          overflow: 'hidden',
        },
        animatedStyle,
      ]}>
      <LinearGradient
        colors={config.colors}
        start={{x: 0, y: 0}}
        end={{x: 0, y: 1}}
        style={{
          paddingHorizontal: 8,
          paddingVertical: 8,
          gap: 8,
          alignItems: 'center',
        }}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
          <Ionicons name={config.icon} size={14} color={config.iconColor} />
          <Text style={{fontSize: 10, color: '#757575', fontWeight: '600'}}>
            {config.label}
          </Text>
        </View>

        <Text style={{fontSize: 18, fontWeight: '800', color: '#212121'}}>
          {displayText}
        </Text>

        <View style={{
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
          minWidth: 60,
          alignItems: 'center',
        }}>
          <Text style={{fontSize: 11, color: '#757575', fontWeight: '600'}}>
            Oran
          </Text>
          <Text style={{fontSize: 14, fontWeight: '800', color: '#1976D2'}}>
            {oddText(odd)}
          </Text>
        </View>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
        }}>
          <Ionicons name="add-circle" size={14} color="#1976D2" />
          <Text style={{fontSize: 11, fontWeight: '700', color: '#212121'}}>
            Kupona Ekle
          </Text>
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
}
