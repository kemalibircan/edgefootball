import React, {useEffect} from 'react';
import {Text, View, Dimensions} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from '../../theme/colors';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type Props = {
  message: string;
  type?: ToastType;
  duration?: number;
  visible: boolean;
  onHide: () => void;
};

const {width} = Dimensions.get('window');

export function Toast({
  message,
  type = 'info',
  duration = 3000,
  visible,
  onHide,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Show toast
      translateY.value = withSpring(insets.top + 10, {
        damping: 15,
        stiffness: 150,
      });
      opacity.value = withTiming(1, {duration: 200});

      // Auto hide after duration
      const timer = setTimeout(() => {
        translateY.value = withTiming(-100, {duration: 300});
        opacity.value = withTiming(0, {duration: 300}, () => {
          runOnJS(onHide)();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, duration, insets.top, onHide, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{translateY: translateY.value}],
    opacity: opacity.value,
  }));

  const config = {
    success: {
      icon: 'checkmark-circle',
      bgColor: colors.successSoft,
      borderColor: colors.successBorder,
      iconColor: colors.success,
    },
    error: {
      icon: 'close-circle',
      bgColor: colors.dangerSoft,
      borderColor: colors.dangerBorder,
      iconColor: colors.danger,
    },
    warning: {
      icon: 'warning',
      bgColor: colors.warningSoft,
      borderColor: colors.warningBorder,
      iconColor: colors.warning,
    },
    info: {
      icon: 'information-circle',
      bgColor: colors.accentSoft,
      borderColor: colors.accentBorder,
      iconColor: colors.accent,
    },
  };

  const typeConfig = config[type];

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 16,
          right: 16,
          zIndex: 9999,
        },
        animatedStyle,
      ]}>
      <View
        style={{
          backgroundColor: typeConfig.bgColor,
          borderWidth: 1,
          borderColor: typeConfig.borderColor,
          borderRadius: 14,
          padding: 14,
          flexDirection: 'row',
          gap: 12,
          alignItems: 'center',
          shadowColor: colors.shadow,
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: {width: 0, height: 6},
          elevation: 8,
          maxWidth: width - 32,
        }}>
        <Ionicons name={typeConfig.icon} size={24} color={typeConfig.iconColor} />
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            color: colors.text,
            fontWeight: '600',
            lineHeight: 19,
          }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
