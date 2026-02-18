import React, {useState} from 'react';
import {Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type {AuthStackParamList} from '../../navigation/types';
import {requestRegisterCode, verifyRegisterCode} from '../../lib/api/endpoints';
import {GoogleSignInCancelledError, signInWithGoogle} from '../../lib/auth/googleSignIn';
import {useAuthStore} from '../../store/authStore';
import {messageFromUnknown} from '../../utils/error';
import {colors} from '../../theme/colors';
import {StatusBanner} from '../../components/common/StatusBanner';
import {AppTextInput} from '../../components/common/AppTextInput';
import {GradientButton} from '../../components/common/GradientButton';
import {AuthShell} from '../../components/auth/AuthShell';
import {PasswordStrengthIndicator} from '../../components/common/PasswordStrengthIndicator';

export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

type Step = 'credentials' | 'verification';

export function RegisterScreen({navigation}: RegisterScreenProps) {
  const setSession = useAuthStore(state => state.setSession);
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const normalizedEmail = email.trim().toLowerCase();

  const validateCredentials = () => {
    if (!normalizedEmail) {
      setError('Email adresi zorunludur.');
      return false;
    }
    if (!normalizedEmail.includes('@')) {
      setError('Geçerli bir email adresi girin.');
      return false;
    }
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Şifreler uyuşmuyor.');
      return false;
    }
    if (!acceptTerms) {
      setError('Kullanım koşullarını kabul etmelisiniz.');
      return false;
    }
    return true;
  };

  const onRequestCode = async () => {
    if (!validateCredentials()) {
      return;
    }

    setError('');
    setSuccess('');
    setRequestingCode(true);
    try {
      await requestRegisterCode(normalizedEmail, password);
      setStep('verification');
      setSuccess('Doğrulama kodu email adresinize gönderildi.');
    } catch (e) {
      setError(messageFromUnknown(e, 'Kayıt kodu gönderilemedi.'));
    } finally {
      setRequestingCode(false);
    }
  };

  const onVerifyCode = async () => {
    if (!code.trim()) {
      setError('Doğrulama kodu zorunludur.');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = await verifyRegisterCode(normalizedEmail, code.trim());
      await setSession(payload);
    } catch (e) {
      setError(messageFromUnknown(e, 'Kayıt başarısız.'));
    } finally {
      setLoading(false);
    }
  };

  const onGoogleRegister = async () => {
    setError('');
    setSuccess('');
    setGoogleLoading(true);
    try {
      const payload = await signInWithGoogle();
      await setSession(payload);
    } catch (e) {
      if (e instanceof GoogleSignInCancelledError) {
        return;
      }
      setError(messageFromUnknown(e, 'Gmail ile kayit basarisiz.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title={step === 'credentials' ? 'Yeni Hesap Oluştur' : 'Email Doğrulama'}
      subtitle={
        step === 'credentials'
          ? 'Hemen üye ol, futbol analiz dünyasına katıl.'
          : 'Email adresine gönderilen kodu gir ve hesabını aktifleştir.'
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
              backgroundColor: step === 'verification' ? colors.accent : colors.surface,
            }} />
          </View>
          <Text style={{fontSize: 12, color: colors.textMuted, marginTop: 6, textAlign: 'center'}}>
            Adım {step === 'credentials' ? '1' : '2'} / 2
          </Text>
        </Animated.View>

        {step === 'credentials' ? (
          <>
            {/* Step 1: Credentials */}
            <Animated.View entering={FadeInDown.delay(160).duration(360)}>
              <AppTextInput 
                label="Email Adresi" 
                value={email} 
                onChangeText={setEmail} 
                autoCapitalize="none" 
                keyboardType="email-address" 
                iconName="mail-outline" 
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(360)}>
              <AppTextInput 
                label="Şifre" 
                value={password} 
                onChangeText={setPassword} 
                secureTextEntry 
                showPasswordToggle
                iconName="lock-closed-outline" 
              />
            </Animated.View>

            {password ? (
              <Animated.View entering={FadeIn.duration(300)}>
                <PasswordStrengthIndicator password={password} />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(240).duration(360)}>
              <AppTextInput
                label="Şifre Tekrar"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                showPasswordToggle
                iconName="shield-checkmark-outline"
              />
            </Animated.View>

            {/* Terms Checkbox */}
            <Animated.View entering={FadeInDown.delay(280).duration(360)}>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                backgroundColor: colors.surface,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: acceptTerms ? colors.accentBorder : colors.line,
              }}>
                <View
                  onTouchEnd={() => setAcceptTerms(prev => !prev)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: acceptTerms ? colors.accent : colors.lineStrong,
                    backgroundColor: acceptTerms ? colors.accentSoft : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  {acceptTerms ? (
                    <Ionicons name="checkmark" size={16} color={colors.accent} />
                  ) : null}
                </View>
                <Text style={{flex: 1, fontSize: 13, color: colors.text, lineHeight: 18}}>
                  Kullanım Koşulları ve Gizlilik Politikasını kabul ediyorum
                </Text>
              </View>
            </Animated.View>

            {error ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <StatusBanner message={error} tone="error" />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(320).duration(360)} style={{marginTop: 4}}>
              <GradientButton 
                title="Devam Et" 
                onPress={onRequestCode} 
                loading={requestingCode} 
                iconName="arrow-forward-outline" 
              />
            </Animated.View>

            {/* Divider */}
            <Animated.View entering={FadeInDown.delay(350).duration(360)}>
              <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 4}}>
                <View style={{flex: 1, height: 1, backgroundColor: colors.line}} />
                <Text style={{marginHorizontal: 12, fontSize: 12, color: colors.textMuted}}>veya</Text>
                <View style={{flex: 1, height: 1, backgroundColor: colors.line}} />
              </View>
            </Animated.View>

            {/* Gmail Sign Up */}
            <Animated.View entering={FadeInDown.delay(380).duration(360)}>
              <GradientButton
                title="Gmail ile Kayıt Ol"
                variant="secondary"
                iconName="logo-google"
                loading={googleLoading}
                onPress={onGoogleRegister}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(410).duration(360)} style={{marginTop: 4}}>
              <GradientButton 
                title="Zaten Hesabım Var" 
                onPress={() => navigation.navigate('Login')} 
                variant="ghost" 
                iconName="log-in-outline"
              />
            </Animated.View>
          </>
        ) : (
          <>
            {/* Step 2: Verification */}
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

            {error ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <StatusBanner message={error} tone="error" />
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInDown.delay(240).duration(360)} style={{marginTop: 4}}>
              <GradientButton 
                title="Hesabı Aktifleştir" 
                onPress={onVerifyCode} 
                loading={loading} 
                iconName="checkmark-circle-outline" 
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(280).duration(360)} style={{gap: 10}}>
              <GradientButton 
                title="Kodu Tekrar Gönder" 
                onPress={onRequestCode} 
                loading={requestingCode}
                variant="secondary" 
                iconName="refresh-outline"
              />
              <GradientButton 
                title="Geri Dön" 
                onPress={() => {
                  setStep('credentials');
                  setCode('');
                  setError('');
                  setSuccess('');
                }} 
                variant="ghost" 
                iconName="arrow-back-outline"
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(320).duration(360)}>
              <Text style={{fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16}}>
                Kod gelmedi mi? Spam klasörünü kontrol edin veya 60 saniye sonra tekrar deneyin.
              </Text>
            </Animated.View>
          </>
        )}
      </View>
    </AuthShell>
  );
}
