import React from 'react';
import {View, ScrollView, ViewProps, StyleProp, ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {colors} from '../../theme/colors';
import {spacing} from '../../theme/spacing';

type Props = ViewProps & {
  children: React.ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  includeTopSafeArea?: boolean;
  includeBottomSafeArea?: boolean;
  preset?: 'list' | 'form' | 'plain';
  disableHorizontalPadding?: boolean;
};

export function ScreenContainer({
  children,
  scroll = true,
  contentContainerStyle,
  includeTopSafeArea = true,
  includeBottomSafeArea = false,
  preset = 'form',
  disableHorizontalPadding = false,
}: Props) {
  const horizontalPadding = disableHorizontalPadding ? 0 : spacing.md;
  const scrollBaseStyle: ViewStyle =
    preset === 'plain'
      ? {paddingBottom: spacing.xl}
      : preset === 'list'
      ? {paddingTop: spacing.xs, paddingBottom: spacing.xl, gap: spacing.sm, paddingHorizontal: horizontalPadding}
      : {paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm, paddingHorizontal: horizontalPadding};

  const plainBaseStyle: ViewStyle =
    preset === 'plain'
      ? {flex: 1}
      : preset === 'list'
      ? {flex: 1, paddingTop: spacing.xs, gap: spacing.sm, paddingHorizontal: horizontalPadding}
      : {flex: 1, paddingTop: spacing.md, gap: spacing.sm, paddingHorizontal: horizontalPadding};

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[scrollBaseStyle, contentContainerStyle]}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[plainBaseStyle, contentContainerStyle]}>{children}</View>
  );

  const safeAreaEdges: Array<'top' | 'bottom'> = [];
  if (includeTopSafeArea) {
    safeAreaEdges.push('top');
  }
  if (includeBottomSafeArea) {
    safeAreaEdges.push('bottom');
  }

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: colors.background}} edges={safeAreaEdges}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{x: 0.12, y: 0}}
        end={{x: 0.88, y: 1}}
        style={{flex: 1}}>
        {content}
      </LinearGradient>
    </SafeAreaView>
  );
}
