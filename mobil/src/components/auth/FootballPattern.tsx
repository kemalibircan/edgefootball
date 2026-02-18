import React from 'react';
import {View} from 'react-native';
import {colors} from '../../theme/colors';

type Props = {
  size?: number;
  opacity?: number;
  color?: string;
};

// Simple football pattern using circles and shapes
export function FootballIcon({size = 80, opacity = 0.15, color}: Props) {
  const fillColor = color || colors.accent;
  
  return (
    <View style={{width: size, height: size, opacity}}>
      {/* Main circle */}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: fillColor,
          position: 'absolute',
        }}
      />
      {/* Pentagon pattern */}
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          backgroundColor: fillColor,
          position: 'absolute',
          top: size * 0.15,
          left: size * 0.3,
          transform: [{rotate: '0deg'}],
          opacity: 0.6,
        }}
      />
      <View
        style={{
          width: size * 0.3,
          height: size * 0.3,
          backgroundColor: fillColor,
          position: 'absolute',
          top: size * 0.55,
          left: size * 0.35,
          opacity: 0.5,
        }}
      />
    </View>
  );
}

// Goal net pattern using grid
export function GoalNetIcon({size = 100, opacity = 0.12, color}: Props) {
  const strokeColor = color || colors.accent;
  const gridSize = 5;
  const cellSize = size / gridSize;
  
  return (
    <View style={{width: size, height: size, opacity}}>
      {/* Vertical lines */}
      {Array.from({length: gridSize + 1}).map((_, i) => (
        <View
          key={`v-${i}`}
          style={{
            position: 'absolute',
            left: i * cellSize,
            top: 0,
            width: 1.5,
            height: size,
            backgroundColor: strokeColor,
          }}
        />
      ))}
      {/* Horizontal lines */}
      {Array.from({length: gridSize + 1}).map((_, i) => (
        <View
          key={`h-${i}`}
          style={{
            position: 'absolute',
            top: i * cellSize,
            left: 0,
            height: 1.5,
            width: size,
            backgroundColor: strokeColor,
          }}
        />
      ))}
    </View>
  );
}

// Whistle icon using circles
export function WhistleIcon({size = 60, opacity = 0.18, color}: Props) {
  const fillColor = color || colors.accent;
  
  return (
    <View style={{width: size, height: size, opacity}}>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.5,
          borderRadius: (size * 0.5) / 2,
          backgroundColor: fillColor,
          position: 'absolute',
          left: size * 0.15,
          top: size * 0.25,
          opacity: 0.7,
        }}
      />
      <View
        style={{
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: (size * 0.3) / 2,
          borderWidth: 2,
          borderColor: fillColor,
          position: 'absolute',
          left: size * 0.25,
          top: size * 0.35,
        }}
      />
      <View
        style={{
          width: size * 0.3,
          height: size * 0.15,
          backgroundColor: fillColor,
          position: 'absolute',
          right: size * 0.05,
          top: size * 0.425,
          opacity: 0.8,
        }}
      />
    </View>
  );
}

// Glove icon using rectangles
export function GloveIcon({size = 70, opacity = 0.14, color}: Props) {
  const fillColor = color || colors.accent;
  
  return (
    <View style={{width: size, height: size, opacity}}>
      {/* Fingers */}
      {[0, 1, 2, 3].map(i => (
        <View
          key={i}
          style={{
            width: size * 0.15,
            height: size * 0.5,
            backgroundColor: fillColor,
            position: 'absolute',
            left: size * 0.15 + i * size * 0.18,
            top: size * 0.15,
            borderRadius: size * 0.075,
            opacity: 0.6 + i * 0.05,
          }}
        />
      ))}
      {/* Palm */}
      <View
        style={{
          width: size * 0.7,
          height: size * 0.35,
          backgroundColor: fillColor,
          position: 'absolute',
          left: size * 0.15,
          bottom: size * 0.15,
          borderRadius: size * 0.1,
          opacity: 0.8,
        }}
      />
    </View>
  );
}
