import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import {colors} from '../../theme/colors';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  selectedFixture?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  placeholder = 'Seçili maç için sorunu yaz...',
  disabled = false,
  sending = false,
  selectedFixture = false,
}: Props) {
  const [isFocused, setIsFocused] = useState(false);
  const sendButtonScale = useSharedValue(1);
  const sendButtonRotation = useSharedValue(0);

  const canSend = selectedFixture && !sending && value.trim().length > 0;

  const sendButtonStyle = useAnimatedStyle(() => ({
    transform: [
      {scale: sendButtonScale.value},
      {rotate: `${sendButtonRotation.value}deg`},
    ],
  }));

  const handleSendPress = () => {
    if (!canSend) return;

    sendButtonScale.value = withSequence(
      withSpring(0.9, {damping: 15, stiffness: 400}),
      withSpring(1, {damping: 15, stiffness: 400}),
    );

    sendButtonRotation.value = withSequence(
      withTiming(-10, {duration: 100}),
      withTiming(10, {duration: 100}),
      withTiming(0, {duration: 100}),
    );

    onSend();
  };

  return (
    <View style={{gap: 6}}>
      {!selectedFixture ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
          <Ionicons name="alert-circle" size={12} color="#FF9800" />
          <Text style={{fontSize: 10, color: '#757575'}}>Önce maç seçin</Text>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isFocused ? '#1976D2' : '#E0E0E0',
          backgroundColor: '#F5F5F5',
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9E9E9E"
          multiline
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            flex: 1,
            minHeight: 36,
            maxHeight: 72,
            fontSize: 14,
            color: '#212121',
            paddingVertical: 0,
          }}
        />

        <AnimatedPressable
          onPress={handleSendPress}
          disabled={!canSend || disabled}
          style={[
            {
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: canSend ? '#1976D2' : '#BDBDBD',
              alignItems: 'center',
              justifyContent: 'center',
            },
            sendButtonStyle,
          ]}>
          <Ionicons
            name={sending ? 'hourglass-outline' : 'send'}
            size={18}
            color="#FFFFFF"
          />
        </AnimatedPressable>
      </View>
    </View>
  );
}
