import React from 'react';
import {StyleSheet, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {colors} from '../../theme/colors';
import {FootballIcon, GoalNetIcon, WhistleIcon, GloveIcon} from './FootballPattern';

export function BrandBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientMid, colors.gradientEnd]}
        start={{x: 0.08, y: 0}}
        end={{x: 0.92, y: 1}}
        style={StyleSheet.absoluteFill}
      />

      {/* Football patterns scattered across the background */}
      <View style={{position: 'absolute', top: -20, right: 30}}>
        <FootballIcon size={120} opacity={0.12} />
      </View>

      <View style={{position: 'absolute', top: 100, left: -30}}>
        <GoalNetIcon size={140} opacity={0.08} />
      </View>

      <View style={{position: 'absolute', top: '35%', right: -20}}>
        <GloveIcon size={100} opacity={0.1} />
      </View>

      <View style={{position: 'absolute', bottom: 120, left: 20}}>
        <WhistleIcon size={80} opacity={0.15} />
      </View>

      <View style={{position: 'absolute', bottom: -30, right: -40}}>
        <FootballIcon size={160} opacity={0.1} />
      </View>

      <View style={{position: 'absolute', top: '60%', left: -50}}>
        <FootballIcon size={100} opacity={0.08} />
      </View>

      {/* Subtle accent glow for depth */}
      <View
        style={{
          position: 'absolute',
          width: 200,
          height: 200,
          borderRadius: 999,
          backgroundColor: colors.glow,
          top: -60,
          right: -40,
          opacity: 0.15,
        }}
      />
    </View>
  );
}
