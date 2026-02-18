import React, {useState, useEffect} from 'react';
import {Modal, View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform} from 'react-native';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {colors} from '../../theme/colors';
import {GradientButton} from '../common/GradientButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  defaultName?: string;
  loading?: boolean;
};

export function CouponNameModal({
  visible,
  onClose,
  onSave,
  defaultName = '',
  loading = false,
}: Props) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (visible) {
      // Generate default name with current date/time
      if (!defaultName) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('tr-TR', {
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        });
        const timeStr = now.toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setName(`Kupon - ${dateStr} ${timeStr}`);
      } else {
        setName(defaultName);
      }
    }
  }, [visible, defaultName]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (trimmedName) {
      onSave(trimmedName);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.modalBackdrop,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{width: '100%', maxWidth: 400}}>
          <Animated.View
            entering={FadeInDown.duration(300)}
            onTouchEnd={(e) => e.stopPropagation()}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: colors.backgroundElevated,
                borderRadius: 20,
                padding: 20,
                gap: 18,
                shadowColor: colors.shadow,
                shadowOpacity: 0.3,
                shadowRadius: 20,
                shadowOffset: {width: 0, height: 10},
                elevation: 10,
              }}>
              {/* Header */}
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Ionicons name="ticket" size={20} color={colors.accent} />
                  </View>
                  <Text style={{fontSize: 20, fontWeight: '800', color: colors.text}}>
                    Kupon Kaydet
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </Pressable>
              </View>

              {/* Description */}
              <Text style={{fontSize: 14, color: colors.textMuted, lineHeight: 20}}>
                Kuponuna bir isim ver. Daha sonra kolayca bulabilirsin.
              </Text>

              {/* Input */}
              <View style={{gap: 8}}>
                <Text style={{fontSize: 13, color: colors.textMuted, fontWeight: '600'}}>
                  Kupon İsmi
                </Text>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.lineStrong,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  minHeight: 52,
                }}>
                  <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Kupon ismi girin"
                    placeholderTextColor={colors.placeholder}
                    maxLength={100}
                    style={{
                      flex: 1,
                      fontSize: 15,
                      color: colors.text,
                      paddingVertical: 12,
                    }}
                  />
                </View>
                <Text style={{fontSize: 11, color: colors.textMuted}}>
                  {name.length}/100 karakter
                </Text>
              </View>

              {/* Buttons */}
              <View style={{gap: 10, marginTop: 4}}>
                <GradientButton
                  title="Kaydet"
                  onPress={handleSave}
                  loading={loading}
                  disabled={!name.trim() || loading}
                  iconName="checkmark-circle-outline"
                />
                <GradientButton
                  title="İptal"
                  onPress={onClose}
                  variant="secondary"
                  iconName="close-circle-outline"
                />
              </View>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
