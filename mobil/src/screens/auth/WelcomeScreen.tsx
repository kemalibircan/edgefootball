import React, {useState} from 'react';
import {Text, View, Dimensions} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import Animated, {FadeInDown, FadeIn} from 'react-native-reanimated';
import Ionicons from 'react-native-vector-icons/Ionicons';
import type {AuthStackParamList} from '../../navigation/types';
import {AuthShell} from '../../components/auth/AuthShell';
import {GradientButton} from '../../components/common/GradientButton';
import {colors} from '../../theme/colors';
import {StatusBanner} from '../../components/common/StatusBanner';
import {GoogleSignInCancelledError, signInWithGoogle} from '../../lib/auth/googleSignIn';
import {useAuthStore} from '../../store/authStore';
import {messageFromUnknown} from '../../utils/error';

type Props = NativeStackScreenProps<AuthStackParamList, 'Welcome'>;

type ValueCard = {
  icon: string;
  title: string;
  body: string;
  color: string;
};

const VALUE_CARDS: ValueCard[] = [
  {
    icon: 'flash',
    title: 'Canli Oran Takibi',
    body: 'Dakika dakika oran degisimlerini takip et, en iyi firsatlari yakala.',
    color: colors.warning,
  },
  {
    icon: 'sparkles',
    title: 'AI Destekli Analiz',
    body: 'Yapay zeka tahminleriyle guclu maclari kesfet, kazanc oranini artir.',
    color: colors.accent,
  },
  {
    icon: 'ticket',
    title: 'Akilli Kupon Yonetimi',
    body: 'Kuponlarini kaydet, paylas ve basarili stratejilerini tekrar kullan.',
    color: colors.success,
  },
];

const {width} = Dimensions.get('window');
const cardWidth = width - 80;

export function WelcomeScreen({navigation}: Props) {
  const setSession = useAuthStore(state => state.setSession);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const onGoogleContinue = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const payload = await signInWithGoogle();
      await setSession(payload);
    } catch (e) {
      if (e instanceof GoogleSignInCancelledError) {
        return;
      }
      setError(messageFromUnknown(e, 'Gmail ile giris basarisiz.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthShell
      title="Edge Football"
      subtitle="Profesyonel iddaa analiz platformu. Canli oranlar, AI tahminleri ve akilli kupon yonetimi."
      enterDelay={20}
      contentAlignment="center"
      includeTopSafeArea>
      <View style={{gap: 16}}>
        {/* Hero Stats */}
        <Animated.View 
          entering={FadeInDown.delay(140).duration(420)}
          style={{
            flexDirection: 'row',
            gap: 10,
            justifyContent: 'center',
          }}>
          <View style={{
            flex: 1,
            backgroundColor: colors.successSoft,
            borderWidth: 1,
            borderColor: colors.successBorder,
            borderRadius: 12,
            padding: 12,
            alignItems: 'center',
          }}>
            <Text style={{fontSize: 24, fontWeight: '800', color: colors.success}}>95%</Text>
            <Text style={{fontSize: 11, color: colors.textMuted, marginTop: 2}}>Dogruluk</Text>
          </View>
          <View style={{
            flex: 1,
            backgroundColor: colors.accentSoft,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            borderRadius: 12,
            padding: 12,
            alignItems: 'center',
          }}>
            <Text style={{fontSize: 24, fontWeight: '800', color: colors.accent}}>50K+</Text>
            <Text style={{fontSize: 11, color: colors.textMuted, marginTop: 2}}>Kullanici</Text>
          </View>
          <View style={{
            flex: 1,
            backgroundColor: colors.warningSoft,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            borderRadius: 12,
            padding: 12,
            alignItems: 'center',
          }}>
            <Text style={{fontSize: 24, fontWeight: '800', color: colors.warning}}>24/7</Text>
            <Text style={{fontSize: 11, color: colors.textMuted, marginTop: 2}}>Canli</Text>
          </View>
        </Animated.View>

        {/* Value Cards */}
        <View style={{gap: 12}}>
          {VALUE_CARDS.map((item, index) => (
            <Animated.View
              key={item.title}
              entering={FadeInDown.delay(200 + index * 70).duration(420)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                padding: 16,
                flexDirection: 'row',
                gap: 14,
                alignItems: 'center',
                shadowColor: colors.shadow,
                shadowOpacity: 0.08,
                shadowRadius: 8,
                shadowOffset: {width: 0, height: 4},
                elevation: 2,
              }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: `${item.color}20`,
                }}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <View style={{flex: 1, gap: 4}}>
                <Text style={{fontSize: 15, fontWeight: '800', color: colors.text}}>{item.title}</Text>
                <Text style={{fontSize: 13, lineHeight: 18, color: colors.textMuted}}>{item.body}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* CTA Buttons */}
        <Animated.View entering={FadeInDown.delay(440).duration(420)} style={{marginTop: 8, gap: 12}}>
          <GradientButton 
            title="Giris Yap" 
            iconName="log-in-outline" 
            onPress={() => navigation.replace('Login')} 
          />
          <GradientButton 
            title="Kayit Ol" 
            variant="secondary" 
            iconName="person-add-outline" 
            onPress={() => navigation.replace('Register')} 
          />
          
          {/* Divider */}
          <View style={{flexDirection: 'row', alignItems: 'center', marginVertical: 4}}>
            <View style={{flex: 1, height: 1, backgroundColor: colors.line}} />
            <Text style={{marginHorizontal: 12, fontSize: 12, color: colors.textMuted}}>veya</Text>
            <View style={{flex: 1, height: 1, backgroundColor: colors.line}} />
          </View>

          <GradientButton
            title="Gmail ile Devam Et"
            variant="secondary"
            iconName="logo-google"
            loading={googleLoading}
            onPress={onGoogleContinue}
          />

          {error ? <StatusBanner message={error} tone="error" /> : null}
        </Animated.View>

        {/* Footer note */}
        <Animated.View entering={FadeIn.delay(540).duration(420)}>
          <Text style={{fontSize: 11, color: colors.textMuted, textAlign: 'center', lineHeight: 16}}>
            Hesap olusturarak Kullanim Kosullari ve Gizlilik Politikamizi kabul etmis olursunuz.
          </Text>
        </Animated.View>
      </View>
    </AuthShell>
  );
}
