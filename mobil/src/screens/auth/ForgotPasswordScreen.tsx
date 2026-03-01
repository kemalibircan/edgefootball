import React, {useState, useEffect} from 'react';
import {Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type {HomeStackParamList} from '../../navigation/types';
import {confirmForgotPassword, requestForgotPasswordCode} from '../../lib/api/endpoints';
import {messageFromUnknown} from '../../utils/error';
import {colors} from '../../theme/colors';
import {StatusBanner} from '../../components/common/StatusBanner';
import {AppTextInput} from '../../components/common/AppTextInput';
import {GradientButton} from '../../components/common/GradientButton';
import {AuthShell} from '../../components/auth/AuthShell';
import {PasswordStrengthIndicator} from '../../components/common/PasswordStrengthIndicator';

export type ForgotPasswordScreenProps = NativeStackScreenProps<HomeStackParamList, 'ForgotPassword'>;

type Step = 'email' | 'reset';

export function ForgotPasswordScreen({navigation}: ForgotPasswordScreenProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [countdown, setCountdown] = useState(0);

  const normalizedEmail = email.trim().toLowerCase();

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const onRequestCode = async () => {
    if (!normalizedEmail) {
      setError('Email adresi zorunludur.');
      return;
    }
    if (!normalizedEmail.includes('@')) {
      setError('Geçerli bir email adresi girin.');
      return;
    }

    setRequestingCode(true);
    setError('');
    setSuccess('');

    try {
      await requestForgotPasswordCode(normalizedEmail);
      setStep('reset');
      setCountdown(60);
      setSuccess('Şifre sıfırlama kodu email adresinize gönderildi.');
    } catch (e) {
      setError(messageFromUnknown(e, 'Kod gönderilemedi.'));
    } finally {
      setRequestingCode(false);
    }
  };

  const onResetPassword = async () => {
    if (!code.trim()) {
      setError('Doğrulama kodu zorunludur.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Şifreler uyuşmuyor.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const payload = await confirmForgotPassword(normalizedEmail, code.trim(), newPassword);
      setSuccess(payload.message || 'Şifreniz başarıyla güncellendi!');
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigation.navigate('Login');
      }, 2000);
    } catch (e) {
      setError(messageFromUnknown(e, 'Şifre güncellenemedi.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === 'email' ? 'Şifremi Unuttum' : 'Yeni Şifre Belirle'}
      subtitle={
        step === 'email'
          ? 'Email adresini gir, sana şifre sıfırlama kodu gönderelim.'
          : 'Kodu gir ve yeni şifreni belirle.'
      }
      enterDelay={30}>
      <View style={{gap: 14}}>
        {/* Progress Indicator */}
        <Animated.View entering={FadeInDown.delay(120).duration(360)}>
          <View style={{flexDirection: 'row', gap: 8, alignItems: 'center'}}>
            <View style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.accent,
            }} />
            <View style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: step === 'reset' ? colors.accent : colors.surface,
            }} />
          </View>
          <Text style={{fontSize: 12, color: colors.textMuted, marginTop: 6, textAlign: 'center'}}>
            Adım {step === 'email' ? '1' : '2'} / 2
          </Text>
        </Animated.View>

        {step === 'email' ? (
          <>
            {/* Step 1: Email */}
            <Animated.View entering={FadeInDown.delay(160).duration(360)}>
              <AppTextInput 
                label="Email Adresi" 
                value={email} 
                onChangeText={setEmail} 
                autoCapitalize="none" 
                keyboardType="email-address" 
                iconName="mail-outline" 
                placeholder="ornek@email.com"
              />
            </Animated.View>

            {error ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <StatusBanner message={error} tone="error" />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(200).duration(360)} style={{marginTop: 4}}>
              <GradientButton 
                title="Kod Gönder" 
                onPress={onRequestCode} 
                loading={requestingCode} 
                iconName="paper-plane-outline" 
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(240).duration(360)} style={{marginTop: 4}}>
              <GradientButton 
                title="Giriş Sayfasına Dön" 
                onPress={() => navigation.navigate('Login')} 
                variant="ghost" 
                iconName="arrow-back-outline"
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(280).duration(360)}>
              <View style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'flex-start',
              }}>
                <Ionicons name="information-circle" size={20} color={colors.accent} style={{marginTop: 2}} />
                <Text style={{flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17}}>
                  Kayıtlı email adresini gir. Şifre sıfırlama kodunu bu adrese göndereceğiz.
                </Text>
              </View>
            </Animated.View>
          </>
        ) : (
          <>
            {/* Step 2: Reset Password */}
            <Animated.View entering={FadeInDown.delay(160).duration(360)}>
              <View style={{
                backgroundColor: colors.accentSoft,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                borderRadius: 14,
                padding: 14,
                flexDirection: 'row',
                gap: 12,
                alignItems: 'center',
              }}>
                <Ionicons name="mail" size={24} color={colors.accent} />
                <View style={{flex: 1}}>
                  <Text style={{fontSize: 13, color: colors.text, fontWeight: '600'}}>
                    {normalizedEmail}
                  </Text>
                  <Text style={{fontSize: 12, color: colors.textMuted, marginTop: 2}}>
                    Bu adrese kod gönderdik
                  </Text>
                </View>
              </View>
            </Animated.View>

            {success ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <StatusBanner message={success} tone="success" />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(200).duration(360)}>
              <AppTextInput 
                label="Doğrulama Kodu" 
                value={code} 
                onChangeText={setCode} 
                iconName="key-outline" 
                keyboardType="number-pad"
                placeholder="6 haneli kod"
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(240).duration(360)}>
              <AppTextInput 
                label="Yeni Şifre" 
                value={newPassword} 
                onChangeText={setNewPassword} 
                secureTextEntry 
                showPasswordToggle
                iconName="lock-closed-outline" 
              />
            </Animated.View>

            {newPassword ? (
              <Animated.View entering={FadeIn.duration(300)}>
                <PasswordStrengthIndicator password={newPassword} />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(280).duration(360)}>
              <AppTextInput
                label="Yeni Şifre Tekrar"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                showPasswordToggle
                iconName="shield-checkmark-outline"
              />
            </Animated.View>

            {error ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <StatusBanner message={error} tone="error" />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(320).duration(360)} style={{marginTop: 4}}>
              <GradientButton 
                title="Şifreyi Güncelle" 
                onPress={onResetPassword} 
                loading={loading} 
                iconName="checkmark-circle-outline" 
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(360).duration(360)} style={{gap: 10}}>
              <GradientButton 
                title={countdown > 0 ? `Kodu Tekrar Gönder (${countdown}s)` : 'Kodu Tekrar Gönder'}
                onPress={onRequestCode} 
                loading={requestingCode}
                disabled={countdown > 0}
                variant="secondary" 
                iconName="refresh-outline"
              />
              <GradientButton 
                title="Geri Dön" 
                onPress={() => {
                  setStep('email');
                  setCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                  setError('');
                  setSuccess('');
                  setCountdown(0);
                }} 
                variant="ghost" 
                iconName="arrow-back-outline"
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(400).duration(360)}>
              <View style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                flexDirection: 'row',
                gap: 10,
                alignItems: 'flex-start',
              }}>
                <Ionicons name="shield-checkmark" size={20} color={colors.success} style={{marginTop: 2}} />
                <Text style={{flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16}}>
                  Güvenlik için kod tek kullanımlıktır ve sınırlı süre geçerlidir. Kod gelmedi mi? Spam klasörünü kontrol edin.
                </Text>
              </View>
            </Animated.View>
          </>
        )}
      </View>
    </AuthShell>
  );
}
