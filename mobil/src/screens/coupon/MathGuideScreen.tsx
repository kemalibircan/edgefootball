import React, {useEffect, useRef, useState} from 'react';
import {Modal, Pressable, ScrollView, Text, View} from 'react-native';
import {useMutation, useQuery} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {MathCouponsSection} from '../../components/coupon/MathCouponsSection';
import {useCouponApi} from '../../hooks/useCouponApi';
import type {CouponTaskInfo, MathCouponItem, MathCouponsPayload} from '../../types/api';
import {useCouponStore} from '../../store/couponStore';
import {messageFromUnknown} from '../../utils/error';
import {safeNumber} from '../../utils/format';
import {toSavedCouponItems} from '../../lib/adapters/couponAdapters';
import {normalizeBankrollTl, resolveAutoMathConfig} from '../../lib/coupon/mathConfig';
import {colors} from '../../theme/colors';

function normalizeMathWarnings(coupons: MathCouponsPayload | null): string[] {
  if (!coupons) {
    return [];
  }
  const warnings = coupons?.summary?.warnings;
  return Array.isArray(warnings) ? warnings.map(item => String(item || '')) : [];
}

function calculateEtaSeconds(startedAtMs: number, progress: number) {
  const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
  if (safeProgress <= 0 || safeProgress >= 100 || startedAtMs <= 0) {
    return safeProgress >= 100 ? 0 : null;
  }
  const elapsedSec = Math.max(1, (Date.now() - startedAtMs) / 1000);
  const eta = (elapsedSec * (100 - safeProgress)) / safeProgress;
  return Math.max(1, Math.round(eta));
}

function calculateTotalOddsFromMatches(matches: Array<{odd?: number | null}>) {
  return matches.reduce((acc, item) => {
    const odd = Number(item?.odd);
    if (!Number.isFinite(odd) || odd <= 1) {
      return acc;
    }
    return acc * odd;
  }, 1);
}

export function MathGuideScreen() {
  const couponApi = useCouponApi();
  const insets = useSafeAreaInsets();
  const addPicks = useCouponStore(state => state.addPicks);
  const stake = useCouponStore(state => state.stake);

  const [faqVisible, setFaqVisible] = useState(false);
  const [bankrollTl, setBankrollTl] = useState('1000');
  const [mathTaskId, setMathTaskId] = useState('');
  const [mathTaskSnapshot, setMathTaskSnapshot] = useState<CouponTaskInfo | null>(null);
  const [mathCoupons, setMathCoupons] = useState<MathCouponsPayload | null>(null);
  const [mathWarnings, setMathWarnings] = useState<string[]>([]);
  const [mathInfo, setMathInfo] = useState('');
  const [mathError, setMathError] = useState('');
  const [mathEtaSeconds, setMathEtaSeconds] = useState<number | null>(null);
  const [mathLoading, setMathLoading] = useState(false);
  const [mathAutoConfigView, setMathAutoConfigView] = useState<ReturnType<typeof resolveAutoMathConfig>['view'] | null>(null);

  const mathTaskStartedAtRef = useRef(0);

  const generateMathMutation = useMutation({
    mutationFn: async () => {
      const autoConfig = resolveAutoMathConfig(bankrollTl);
      const response = await couponApi.generateCoupons({
        days_window: autoConfig.days_window,
        matches_per_coupon: autoConfig.matches_per_coupon,
        league_ids: autoConfig.league_ids,
        model_id: autoConfig.model_id,
        bankroll_tl: autoConfig.bankroll_tl,
        include_math_coupons: true,
      });
      return {response, autoConfig};
    },
    onMutate() {
      setMathLoading(true);
      setMathError('');
      setMathInfo('');
      setMathCoupons(null);
      setMathWarnings([]);
      setMathTaskId('');
      setMathTaskSnapshot(null);
      setMathEtaSeconds(null);
      mathTaskStartedAtRef.current = Date.now();
    },
    onSuccess({response, autoConfig}) {
      setMathAutoConfigView(autoConfig.view);
      setMathTaskId(response.task_id);
      setMathTaskSnapshot({
        task_id: response.task_id,
        state: response.status || 'PENDING',
        progress: 5,
        stage: 'Matematiksel kupon task kuyruga alindi',
      });
      setMathInfo('Matematiksel kupon task baslatildi.');
    },
    onError(e) {
      setMathLoading(false);
      setMathEtaSeconds(null);
      setMathError(messageFromUnknown(e, 'Matematiksel kupon uretimi basarisiz.'));
      setMathInfo('');
    },
  });

  const mathTaskQuery = useQuery({
    queryKey: ['coupon-task-math', mathTaskId],
    queryFn: () => couponApi.getCouponTask(mathTaskId),
    enabled: Boolean(mathTaskId),
    refetchInterval: query => {
      const data = query.state.data;
      if (!data) {
        return 1200;
      }
      const done = ['SUCCESS', 'FAILURE', 'REVOKED'].includes(String(data.state).toUpperCase()) || Boolean(data.result);
      return done ? false : 1200;
    },
  });

  useEffect(() => {
    const info = mathTaskQuery.data;
    if (!info) {
      return;
    }

    setMathTaskSnapshot(info);
    const progressValue = Math.max(0, Math.min(100, Number(info.progress) || 0));
    setMathEtaSeconds(calculateEtaSeconds(mathTaskStartedAtRef.current, progressValue));

    const resultMathCoupons = info.result?.math_coupons || null;
    if (resultMathCoupons) {
      setMathCoupons(resultMathCoupons);
      setMathWarnings(normalizeMathWarnings(resultMathCoupons));
    }

    const done = ['SUCCESS', 'FAILURE', 'REVOKED'].includes(String(info.state).toUpperCase()) || Boolean(info.result);
    if (!done) {
      return;
    }

    setMathLoading(false);
    if (String(info.state || '').toUpperCase() === 'FAILURE') {
      setMathError(info.stage || 'Matematiksel kupon task basarisiz oldu.');
      return;
    }
    if (resultMathCoupons) {
      setMathInfo('Matematiksel kuponlar hazirlandi.');
    }
  }, [mathTaskQuery.data]);

  const handleAddMathCoupon = (couponItem: MathCouponItem) => {
    const matches = Array.isArray(couponItem?.matches) ? couponItem.matches : [];
    if (!matches.length) {
      setMathError('Eklenecek kupon bulunamadi.');
      return;
    }
    const added = addPicks(matches);
    if (added <= 0) {
      setMathInfo('Kupondaki maclar zaten kuponunda var.');
      return;
    }
    setMathError('');
    setMathInfo(`${added} mac kupona eklendi.`);
  };

  const handleSaveMathCoupon = async (strategyTitle: string, couponItem: MathCouponItem) => {
    const matches = Array.isArray(couponItem?.matches) ? couponItem.matches : [];
    if (!matches.length) {
      setMathError('Kaydedilecek kupon bulunamadi.');
      return;
    }

    const totalOddsValue = safeNumber(couponItem?.total_odds, calculateTotalOddsFromMatches(matches));
    const perCouponStake = Math.max(1, safeNumber(couponItem?.suggested_stake_tl, stake));
    const couponAmountValue = perCouponStake;
    const maxWinValue = couponAmountValue * totalOddsValue;

    try {
      await couponApi.saveCoupon({
        name: `${strategyTitle} ${new Date().toLocaleString('tr-TR')}`,
        risk_level: 'manual',
        source_task_id: mathTaskId || undefined,
        items: toSavedCouponItems(matches),
        summary: {
          coupon_count: 1,
          stake: perCouponStake,
          total_odds: Number(totalOddsValue.toFixed(2)),
          coupon_amount: Number(couponAmountValue.toFixed(2)),
          max_win: Number(maxWinValue.toFixed(2)),
        },
      });
      setMathError('');
      setMathInfo(`${strategyTitle} Kuponlarima eklendi.`);
    } catch (e) {
      setMathError(messageFromUnknown(e, 'Kupon kaydi basarisiz.'));
    }
  };

  return (
    <ScreenContainer
      preset="list"
      contentContainerStyle={{
        paddingHorizontal: 16,
        gap: 12,
        paddingBottom: insets.bottom + 88,
      }}>
      <View
        testID="math-guide-info-card"
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 16,
          padding: 14,
          gap: 8,
        }}>
        <Text style={{fontSize: 19, fontWeight: '800', color: colors.text}}>Matematiksel Kuponlar (+EV)</Text>
        <Text style={{fontSize: 13, lineHeight: 20, color: colors.textMuted}}>
          Buradaki amac tek kuponu tutturmak degil, uzun vadede daha mantikli kararlar almak. Detayli bilgi ve risk
          notlarini SSS ekranindan gorebilirsin.
        </Text>
        <Pressable
          testID="math-guide-faq-open"
          onPress={() => setFaqVisible(true)}
          style={{
            alignSelf: 'flex-start',
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            backgroundColor: colors.accentSoft,
            paddingHorizontal: 12,
            paddingVertical: 6,
          }}>
          <Text style={{fontSize: 12, color: colors.text, fontWeight: '700'}}>SSS ve risk bilgileri</Text>
        </Pressable>
      </View>

      <MathCouponsSection
        bankrollTl={bankrollTl}
        onChangeBankrollTl={setBankrollTl}
        onBlurBankrollTl={() => setBankrollTl(String(normalizeBankrollTl(bankrollTl)))}
        onGenerate={() => generateMathMutation.mutate()}
        loading={mathLoading}
        taskSnapshot={mathTaskSnapshot}
        etaSeconds={mathEtaSeconds}
        error={mathError}
        info={mathInfo}
        warnings={mathWarnings}
        autoConfigView={mathAutoConfigView}
        mathCoupons={mathCoupons}
        onAddCoupon={handleAddMathCoupon}
        onSaveCoupon={handleSaveMathCoupon}
      />

      <Modal visible={faqVisible} transparent animationType="fade" onRequestClose={() => setFaqVisible(false)}>
        <View style={{flex: 1, justifyContent: 'center', padding: 16, backgroundColor: colors.modalBackdrop}}>
          <Pressable
            testID="math-guide-faq-backdrop"
            onPress={() => setFaqVisible(false)}
            style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0}}
          />
          <View
            style={{
              maxHeight: '82%',
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 16,
              padding: 14,
              gap: 10,
            }}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10}}>
              <Text testID="math-guide-faq-title" style={{fontSize: 17, fontWeight: '800', color: colors.text, flex: 1}}>
                Matematiksel Kuponlar SSS
              </Text>
              <Pressable
                testID="math-guide-faq-close"
                onPress={() => setFaqVisible(false)}
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: colors.lineStrong,
                  backgroundColor: colors.surface,
                }}>
                <Text style={{fontSize: 12, color: colors.textMuted, fontWeight: '700'}}>Kapat</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{gap: 10}} showsVerticalScrollIndicator={false}>
              <View style={{gap: 4}}>
                <Text style={{fontSize: 13, fontWeight: '700', color: colors.text}}>1) Bu alan ne ise yarar?</Text>
                <Text style={{fontSize: 12, color: colors.textMuted}}>
                  Modelin olasilik tahmini ile oranlari karsilastirir; beklenen degeri daha iyi olan secimleri one
                  cikarir.
                </Text>
              </View>
              <View style={{gap: 4}}>
                <Text style={{fontSize: 13, fontWeight: '700', color: colors.text}}>2) Oyna/Oynama ne anlama gelir?</Text>
                <Text style={{fontSize: 12, color: colors.textMuted}}>
                  Oyna etiketi avantajin daha guclu oldugunu, Oynama etiketi avantajin dusuk veya riskin daha yuksek
                  oldugunu gosterir.
                </Text>
              </View>
              <View style={{gap: 4}}>
                <Text style={{fontSize: 13, fontWeight: '700', color: colors.text}}>
                  3) Kesin kazanc garantisi var mi?
                </Text>
                <Text style={{fontSize: 12, color: colors.textMuted}}>
                  Hayir. Futbolda varyans vardir. Bu alan, uzun vadede daha disiplinli karar alman icin yardimci olur.
                </Text>
              </View>
              <View style={{gap: 4}}>
                <Text style={{fontSize: 13, fontWeight: '700', color: colors.text}}>4) Banka niye onemli?</Text>
                <Text style={{fontSize: 12, color: colors.textMuted}}>
                  Banka degeri stake onerilerini belirler. Bu nedenle gercek bankana yakin bir deger girmek risk
                  yonetimi acisindan daha dogrudur.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}
