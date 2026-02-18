import React from 'react';
import {ActivityIndicator, Pressable, Text, ViewStyle, StyleProp, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {colors} from '../../theme/colors';
import {fontWeight, typography} from '../../theme/typography';

type Props = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  iconName?: string;
  size?: 'sm' | 'md';
};

export function GradientButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  style,
  variant = 'primary',
  iconName,
  size = 'md',
}: Props) {
  const isDisabled = disabled || loading;
  const isSmall = size === 'sm';

  const gradientColors =
    variant === 'secondary'
      ? [colors.secondaryButtonStart, colors.secondaryButtonEnd]
      : variant === 'danger'
      ? [colors.dangerButtonStart, colors.dangerButtonEnd]
      : variant === 'ghost'
      ? [colors.ghostButtonFill, colors.ghostButtonFill]
      : [colors.primaryButtonStart, colors.primaryButtonEnd];

  const textColor = variant === 'primary' ? colors.primaryButtonText : colors.text;
  const borderColor = variant === 'primary' ? 'transparent' : variant === 'danger' ? colors.dangerSoftStrong : colors.lineStrong;
  const iconColor = textColor;

  return (
    <Pressable onPress={onPress} disabled={isDisabled} style={style}>
      <LinearGradient
        colors={gradientColors}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={{
          borderRadius: isSmall ? 12 : 16,
          minHeight: isSmall ? 38 : 48,
          opacity: isDisabled ? 0.65 : 1,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: 1,
          borderColor,
          paddingHorizontal: isSmall ? 10 : 14,
        }}>
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <View style={{flexDirection: 'row', alignItems: 'center', gap: isSmall ? 6 : 8}}>
            {iconName ? <Ionicons name={iconName} size={isSmall ? 14 : 16} color={iconColor} /> : null}
            <Text style={{color: textColor, fontSize: isSmall ? typography.caption : typography.label, fontWeight: fontWeight.bold}}>
              {title}
            </Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}
