import React, {useEffect, useMemo, useState} from 'react';
import {Alert, ScrollView, Text, TextInput, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useMutation, useQuery} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuthStore} from '../../store/authStore';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {GradientButton} from '../../components/common/GradientButton';
import {CouponTaskProgress} from '../../components/coupon/CouponTaskProgress';
import {CouponCard} from '../../components/coupon/CouponCard';
import {useCouponApi} from '../../hooks/useCouponApi';
import type {CouponTaskInfo, RiskCoupon} from '../../types/api';
import {useCouponStore, calculateTotalOdds} from '../../store/couponStore';
import {DEFAULT_COUPON_LEAGUES} from '../../constants/leagues';
import {messageFromUnknown} from '../../utils/error';
import {safeNumber} from '../../utils/format';
import {SectionHeader} from '../../components/common/SectionHeader';
import {StatusBanner} from '../../components/common/StatusBanner';
import {colors} from '../../theme/colors';
import {CouponDock} from '../../components/coupon/CouponDock';
import {toSavedCouponItems} from '../../lib/adapters/couponAdapters';
import {getBottomContentInset, TAB_BAR_HEIGHT} from '../../lib/layout/insets';
import type {DockState} from '../../lib/layout/insets';
import {useAiChat} from '../../state/chat/AiChatContext';
import {RISK_SECTIONS, createEmptyRiskCoupons, type RiskKey} from '../../lib/coupon/riskSections';

export function CouponsScreen() {
  const navigation = useNavigation();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const couponApi = useCouponApi();
  const {askFromAction} = useAiChat();

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('HomeTab' as never, { screen: 'Login' } as never);
    }
  }, [isAuthenticated, navigation]);
  const [daysWindow, setDaysWindow] = useState('3');
  const [matchesPerCoupon, setMatchesPerCoupon] = useState('3');
  const [taskId, setTaskId] = useState('');
  const [taskSnapshot, setTaskSnapshot] = useState<CouponTaskInfo | null>(null);
  const [coupons, setCoupons] = useState<Record<RiskKey, RiskCoupon | undefined>>(createEmptyRiskCoupons());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dockState, setDockState] = useState<DockState>('collapsed');

  const insets = useSafeAreaInsets();
  const bottomInset = getBottomContentInset(TAB_BAR_HEIGHT, dockState, insets.bottom);

  const addPicks = useCouponStore(state => state.addPicks);
  const slipItems = useCouponStore(state => state.items);
  const couponCount = useCouponStore(state => state.couponCount);
  const stake = useCouponStore(state => state.stake);
  const setCouponCount = useCouponStore(state => state.setCouponCount);
  const setStake = useCouponStore(state => state.setStake);

  const generateMutation = useMutation({
    mutationFn: () =>
      couponApi.generateCoupons({
        days_window: Math.max(2, Math.min(3, Number(daysWindow) || 3)),
        matches_per_coupon: Math.max(3, Math.min(4, Number(matchesPerCoupon) || 3)),
        league_ids: DEFAULT_COUPON_LEAGUES,
        model_id: null,
        include_math_coupons: false,
      }),
    onMutate() {
      setCoupons(createEmptyRiskCoupons());
    },
    onSuccess(data) {
      setTaskId(data.task_id);
      setTaskSnapshot({
        task_id: data.task_id,
        state: data.status || 'PENDING',
        progress: 5,
        stage: 'Task kuyruga alindi',
      });
      setError('');
      setMessage('Kupon task baslatildi.');
    },
    onError(e) {
      setError(messageFromUnknown(e, 'Kupon uretimi basarisiz.'));
      setMessage('');
    },
  });

  const taskQuery = useQuery({
    queryKey: ['coupon-task', taskId],
    queryFn: () => couponApi.getCouponTask(taskId),
    enabled: Boolean(taskId),
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
    const info = taskQuery.data;
    if (!info) {
      return;
    }
    setTaskSnapshot(info);
    const resultCoupons = info.result?.coupons;
    if (resultCoupons) {
      setCoupons({
        low: resultCoupons.low,
        medium: resultCoupons.medium,
        high: resultCoupons.high,
      });
      setMessage('Kuponlar hazirlandi.');
    }
    if (String(info.state || '').toUpperCase() === 'FAILURE') {
      setError(info.stage || 'Kupon task basarisiz oldu.');
    }
  }, [taskQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async ({riskKey, riskTitle}: {riskKey: RiskKey; riskTitle: string}) => {
      const coupon = coupons[riskKey];
      if (!coupon || !coupon.matches?.length) {
        throw new Error('Kaydedilecek kupon bulunamadi.');
      }

      const totalOdds = safeNumber(coupon.total_odds, calculateTotalOdds(slipItems));
      const couponAmount = couponCount * stake;
      const maxWin = totalOdds * couponAmount;

      return couponApi.saveCoupon({
        name: `${riskTitle} ${new Date().toLocaleString('tr-TR')}`,
        risk_level: riskKey,
        source_task_id: taskId || undefined,
        items: toSavedCouponItems(coupon.matches),
        summary: {
          coupon_count: couponCount,
          stake,
          total_odds: Number(totalOdds.toFixed(2)),
          coupon_amount: Number(couponAmount.toFixed(2)),
          max_win: Number(maxWin.toFixed(2)),
        },
      });
    },
    onSuccess() {
      setMessage('Kupon kaydedildi.');
      setError('');
    },
    onError(e) {
      setError(messageFromUnknown(e, 'Kupon kaydi basarisiz.'));
    },
  });

  const slipSummary = useMemo(() => {
    const totalOdds = calculateTotalOdds(slipItems);
    const couponAmount = couponCount * stake;
    return {
      itemCount: slipItems.length,
      totalOdds,
      couponAmount,
      maxWin: totalOdds * couponAmount,
    };
  }, [couponCount, slipItems, stake]);

  return (
    <ScreenContainer scroll={false} preset="plain" disableHorizontalPadding>
      <View style={{flex: 1}}>
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, gap: 14, paddingBottom: bottomInset}}
          showsVerticalScrollIndicator={false}
          scrollEnabled={dockState !== 'expanded'}>
          <SectionHeader title="Akilli Kuponlar" subtitle="Lig bazli otomatik model ile kuponlari yonet" />

          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 16,
              padding: 14,
              gap: 10,
            }}>
            <Text style={{fontSize: 12, color: colors.textMuted}}>Model secimi otomatik, lig bazli yapiliyor.</Text>

            <View style={{flexDirection: 'row', gap: 10}}>
              <View style={{flex: 1, gap: 6}}>
                <Text style={{color: colors.textMuted}}>Gun Araligi (2-3)</Text>
                <TextInput
                  value={daysWindow}
                  onChangeText={setDaysWindow}
                  keyboardType="number-pad"
                  style={{
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.lineStrong,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    paddingHorizontal: 10,
                  }}
                />
              </View>

              <View style={{flex: 1, gap: 6}}>
                <Text style={{color: colors.textMuted}}>Mac/Kupon (3-4)</Text>
                <TextInput
                  value={matchesPerCoupon}
                  onChangeText={setMatchesPerCoupon}
                  keyboardType="number-pad"
                  style={{
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.lineStrong,
                    backgroundColor: colors.surface,
                    color: colors.text,
                    paddingHorizontal: 10,
                  }}
                />
              </View>
            </View>

            <GradientButton
              title="Kuponlari Uret"
              onPress={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
              iconName="flash-outline"
            />
          </View>

          {taskSnapshot ? (
            <CouponTaskProgress progress={taskSnapshot.progress} stage={taskSnapshot.stage} state={taskSnapshot.state} />
          ) : null}

          {error ? <StatusBanner message={error} tone="error" /> : null}
          {message ? <StatusBanner message={message} tone="success" /> : null}

          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 16,
              padding: 14,
              gap: 6,
            }}>
            <Text style={{fontSize: 16, fontWeight: '700', color: colors.text}}>Kupon Sepeti</Text>
            <Text style={{color: colors.textMuted}}>Mac: {slipSummary.itemCount}</Text>
            <Text style={{color: colors.textMuted}}>Toplam Oran: {slipSummary.totalOdds.toFixed(2)}</Text>
            <View style={{flexDirection: 'row', gap: 10}}>
              <View style={{flex: 1, gap: 6}}>
                <Text style={{color: colors.textMuted}}>Kupon Sayisi</Text>
                <TextInput
                  value={String(couponCount)}
                  onChangeText={value => setCouponCount(Number(value))}
                  keyboardType="number-pad"
                  style={{
                    minHeight: 42,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.lineStrong,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    color: colors.text,
                  }}
                />
              </View>
              <View style={{flex: 1, gap: 6}}>
                <Text style={{color: colors.textMuted}}>Miktar (TL)</Text>
                <TextInput
                  value={String(stake)}
                  onChangeText={value => setStake(Number(value))}
                  keyboardType="number-pad"
                  style={{
                    minHeight: 42,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.lineStrong,
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    color: colors.text,
                  }}
                />
              </View>
            </View>
            <Text style={{color: colors.textMuted}}>Kupon Bedeli: {slipSummary.couponAmount.toFixed(2)} TL</Text>
            <Text style={{color: colors.textMuted}}>Maks Kazanc: {slipSummary.maxWin.toFixed(2)} TL</Text>
          </View>

          <View style={{gap: 12}}>
            {RISK_SECTIONS.map(section => (
              <CouponCard
                key={section.key}
                title={section.title}
                coupon={coupons[section.key]}
                onAddAll={() => {
                  const coupon = coupons[section.key];
                  if (!coupon?.matches?.length) {
                    Alert.alert('Bilgi', 'Eklenecek kupon yok.');
                    return;
                  }
                  const added = addPicks(coupon.matches);
                  setMessage(added > 0 ? `${added} mac kupona eklendi.` : 'Kupondaki maclar zaten kuponunda var.');
                }}
                onSave={() => saveMutation.mutate({riskKey: section.key, riskTitle: section.title})}
                onAskAi={async match => {
                  if (!taskId) {
                    setError('AI analizi icin once kupon task olusturun.');
                    return;
                  }
                  const response = await askFromAction({
                    source: 'generated',
                    task_id: taskId,
                    fixture_id: match.fixture_id,
                    selection: match.selection,
                    model_id: match.model_id || null,
                    home_team_name: match.home_team_name,
                    away_team_name: match.away_team_name,
                    home_team_logo: match.home_team_logo || null,
                    away_team_logo: match.away_team_logo || null,
                    league_id: match.league_id || null,
                    league_name: match.league_name || null,
                    starting_at: match.starting_at || null,
                    match_label: `${match.home_team_name} - ${match.away_team_name}`,
                    question: 'Bu secimin neden guclu oldugunu detaylandir.',
                    language: 'tr',
                  });
                  if (!response.ok) {
                    setError(response.error || 'AI cevabi chat ekranina aktarilamadi.');
                    return;
                  }
                  setError('');
                  setMessage('AI cevabi chat ekranina gonderildi.');
                }}
              />
            ))}
          </View>

        </ScrollView>
      </View>

      <CouponDock onStateChange={setDockState} defaultExpanded={false} />
    </ScreenContainer>
  );
}
