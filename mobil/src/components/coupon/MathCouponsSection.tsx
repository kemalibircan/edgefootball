import React, {useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';
import {GradientButton} from '../common/GradientButton';
import {CouponTaskProgress} from './CouponTaskProgress';
import {StatusBanner} from '../common/StatusBanner';
import {colors} from '../../theme/colors';
import type {CouponTaskInfo, MathCouponItem, MathCouponsPayload} from '../../types/api';
import {groupCouponsByDecision, type MathCouponDecisionItem} from '../../lib/coupon/mathCouponDecision';
import {oddText, safeNumber} from '../../utils/format';

type Props = {
  bankrollTl: string;
  onChangeBankrollTl: (value: string) => void;
  onBlurBankrollTl: () => void;
  onGenerate: () => void;
  loading: boolean;
  taskSnapshot: CouponTaskInfo | null;
  etaSeconds: number | null;
  error: string;
  info: string;
  warnings: string[];
  autoConfigView: {
    daysWindow: number;
    matchesPerCoupon: number;
    leaguesLabel: string;
    modelLabel: string;
    bankroll: number;
  } | null;
  mathCoupons: MathCouponsPayload | null;
  onAddCoupon: (item: MathCouponItem) => void;
  onSaveCoupon: (strategyTitle: string, item: MathCouponItem) => void;
};

function formatTl(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return `${parsed.toFixed(0)} TL`;
}

function formatEta(seconds: number | null) {
  const safe = Number(seconds);
  if (!Number.isFinite(safe) || safe < 0) return '-';
  if (safe <= 1) return '0 sn';
  if (safe < 60) return `${Math.round(safe)} sn`;
  const mins = Math.floor(safe / 60);
  const secs = Math.round(safe % 60);
  return `${mins} dk ${secs} sn`;
}

function mathVariantLabel(variant: string | undefined) {
  if (variant === 'mix_single') return 'Tekli';
  if (variant === 'mix_double') return "2'li";
  if (variant === 'mix_shot') return 'Shot';
  return '';
}

function CouponItemCard({
  item,
  onAddCoupon,
  onSaveCoupon,
  strategyTitle,
  showVariant,
}: {
  item: MathCouponDecisionItem;
  onAddCoupon: (item: MathCouponItem) => void;
  onSaveCoupon: (strategyTitle: string, item: MathCouponItem) => void;
  strategyTitle: string;
  showVariant?: boolean;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: item.decision === 'play' ? colors.successBorder : colors.dangerBorder,
        backgroundColor: item.decision === 'play' ? colors.successSoft : colors.dangerSoft,
        borderRadius: 12,
        padding: 10,
        gap: 8,
      }}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8}}>
        <View style={{flex: 1, gap: 2}}>
          <Text style={{fontSize: 13, fontWeight: '800', color: colors.text}}>{String(item.coupon_id || '-')}</Text>
          <Text style={{fontSize: 12, color: colors.textMuted}}>
            Toplam oran: {oddText(item.total_odds)} | Edge: {safeNumber(item.edge_sum, 0).toFixed(3)}
          </Text>
          <Text style={{fontSize: 12, color: colors.textMuted}}>
            EV skor: {safeNumber(item.expected_value_score, 0).toFixed(2)} | Stake: {formatTl(item.suggested_stake_tl)}
          </Text>
        </View>
        <View style={{alignItems: 'flex-end', gap: 4}}>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: item.decision === 'play' ? colors.successSoftStrong : colors.dangerSoftStrong,
              borderWidth: 1,
              borderColor: item.decision === 'play' ? colors.successHighBorder : colors.dangerHighBorder,
            }}>
            <Text style={{fontSize: 11, color: colors.text, fontWeight: '700'}}>
              {item.decision === 'play' ? 'Oyna' : 'Oynama'}
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.lineStrong,
            }}>
            <Text style={{fontSize: 11, color: colors.textMuted}}>Skor: {safeNumber(item.score, 0)}/100</Text>
          </View>
          {showVariant && mathVariantLabel(item.variant) ? (
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: colors.warningSoft,
                borderWidth: 1,
                borderColor: colors.warningBorder,
              }}>
              <Text style={{fontSize: 11, color: colors.textMuted}}>{mathVariantLabel(item.variant)}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={{fontSize: 12, color: colors.textMuted}}>
        {(Array.isArray(item.matches) ? item.matches : [])
          .map(match => `${match.home_team_name} - ${match.away_team_name} (${match.selection}/${oddText(match.odd)})`)
          .join(' | ')}
      </Text>
      <Text style={{fontSize: 12, color: colors.textMuted}}>Neden: {(item.reasons || []).join(' ')}</Text>

      <View style={{flexDirection: 'row', gap: 8}}>
        <View style={{flex: 1}}>
          <GradientButton title="Kuponuma Ekle" size="sm" iconName="add-circle-outline" onPress={() => onAddCoupon(item)} />
        </View>
        <View style={{flex: 1}}>
          <GradientButton
            title="Kuponlarima Kaydet"
            size="sm"
            variant="secondary"
            iconName="bookmark-outline"
            onPress={() => onSaveCoupon(strategyTitle, item)}
          />
        </View>
      </View>
    </View>
  );
}

type StrategyCardProps = {
  title: string;
  strategyTitle: string;
  grouped: {play: MathCouponDecisionItem[]; skip: MathCouponDecisionItem[]};
  targetRangeText: string;
  stakeText: string;
  generatedText: string;
  warnings: string[];
  showVariant?: boolean;
  skipExpanded: boolean;
  onToggleSkip: () => void;
  onAddCoupon: (item: MathCouponItem) => void;
  onSaveCoupon: (strategyTitle: string, item: MathCouponItem) => void;
};

function StrategyCard({
  title,
  strategyTitle,
  grouped,
  targetRangeText,
  stakeText,
  generatedText,
  warnings,
  showVariant = false,
  skipExpanded,
  onToggleSkip,
  onAddCoupon,
  onSaveCoupon,
}: StrategyCardProps) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 14,
        padding: 12,
        gap: 10,
      }}>
      <View style={{gap: 4}}>
        <Text style={{fontSize: 15, fontWeight: '800', color: colors.text}}>{title}</Text>
        <Text style={{fontSize: 12, color: colors.textMuted}}>{targetRangeText}</Text>
        <Text style={{fontSize: 12, color: colors.textMuted}}>{stakeText}</Text>
        <Text style={{fontSize: 12, color: colors.textMuted}}>{generatedText}</Text>
      </View>

      {warnings.length ? (
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSoft,
            paddingHorizontal: 10,
            paddingVertical: 8,
            gap: 4,
          }}>
          {warnings.map((warning, index) => (
            <Text key={`strategy-warning-${title}-${index}`} style={{fontSize: 12, color: colors.text}}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{flexDirection: 'row', gap: 8}}>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: colors.successSoft,
            borderWidth: 1,
            borderColor: colors.successBorder,
          }}>
          <Text style={{fontSize: 11, color: colors.text}}>Oyna: {grouped.play.length}</Text>
        </View>
        <View
          style={{
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: colors.dangerSoft,
            borderWidth: 1,
            borderColor: colors.dangerBorder,
          }}>
          <Text style={{fontSize: 11, color: colors.text}}>Oynama: {grouped.skip.length}</Text>
        </View>
      </View>

      <View style={{gap: 8}}>
        <Text style={{fontSize: 13, fontWeight: '700', color: colors.text}}>Oyna</Text>
        {grouped.play.length ? (
          grouped.play.map(item => (
            <CouponItemCard
              key={`play-${strategyTitle}-${String(item.coupon_id)}`}
              item={item}
              onAddCoupon={onAddCoupon}
              onSaveCoupon={onSaveCoupon}
              strategyTitle={strategyTitle}
              showVariant={showVariant}
            />
          ))
        ) : (
          <Text style={{fontSize: 12, color: colors.textMuted}}>Bu stratejide su an Oyna onerisi yok.</Text>
        )}
      </View>

      <View style={{gap: 8}}>
        <Pressable
          onPress={onToggleSkip}
          style={{
            minHeight: 34,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.lineStrong,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 10,
          }}>
          <Text style={{fontSize: 12, color: colors.textMuted, fontWeight: '700'}}>
            Oynama ({grouped.skip.length}) {skipExpanded ? '-' : '+'}
          </Text>
        </Pressable>
        {skipExpanded ? (
          grouped.skip.length ? (
            grouped.skip.map(item => (
              <CouponItemCard
                key={`skip-${strategyTitle}-${String(item.coupon_id)}`}
                item={item}
                onAddCoupon={onAddCoupon}
                onSaveCoupon={onSaveCoupon}
                strategyTitle={strategyTitle}
                showVariant={showVariant}
              />
            ))
          ) : (
            <Text style={{fontSize: 12, color: colors.textMuted}}>Bu stratejide Oynama listesinde kupon yok.</Text>
          )
        ) : null}
      </View>
    </View>
  );
}

export function MathCouponsSection({
  bankrollTl,
  onChangeBankrollTl,
  onBlurBankrollTl,
  onGenerate,
  loading,
  taskSnapshot,
  etaSeconds,
  error,
  info,
  warnings,
  autoConfigView,
  mathCoupons,
  onAddCoupon,
  onSaveCoupon,
}: Props) {
  const [skipExpanded, setSkipExpanded] = useState({
    single: false,
    double: false,
    mix: false,
  });

  const singleItems = Array.isArray(mathCoupons?.single_low_mid?.items) ? mathCoupons?.single_low_mid?.items : [];
  const doubleItems = Array.isArray(mathCoupons?.double_system?.items) ? mathCoupons?.double_system?.items : [];
  const mixBaskets = mathCoupons?.mix_portfolio?.baskets;
  const mixSingleItems = Array.isArray(mixBaskets?.single?.items) ? mixBaskets.single.items : [];
  const mixDoubleItems = Array.isArray(mixBaskets?.double?.items) ? mixBaskets.double.items : [];
  const mixShotItems = Array.isArray(mixBaskets?.shot?.items) ? mixBaskets.shot.items : [];

  const mixMergedItems = [
    ...mixSingleItems.map(item => ({...item, coupon_variant: 'mix_single'})),
    ...mixDoubleItems.map(item => ({...item, coupon_variant: 'mix_double'})),
    ...mixShotItems.map(item => ({...item, coupon_variant: 'mix_shot'})),
  ];

  const singleGrouped = groupCouponsByDecision(singleItems, {
    strategyKey: 'single_low_mid',
    targetRange: mathCoupons?.single_low_mid?.target_odds_range || null,
  });

  const doubleGrouped = groupCouponsByDecision(doubleItems, {
    strategyKey: 'double_system',
    targetRange: mathCoupons?.double_system?.target_odds_range || null,
  });

  const mixGrouped = groupCouponsByDecision(mixMergedItems, {
    strategyKey: 'mix_portfolio',
    targetRangeByVariant: {
      mix_single: mixBaskets?.single?.target_odds_range || null,
      mix_double: mixBaskets?.double?.target_odds_range || null,
      mix_shot: mixBaskets?.shot?.target_odds_range || null,
    },
  });

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}>
      <View style={{gap: 4}}>
        <Text style={{fontSize: 18, fontWeight: '800', color: colors.text}}>Matematiksel Olarak Mantikli Kuponlar (+EV)</Text>
        <Text style={{fontSize: 12, color: colors.textMuted}}>
          Banka: {formatTl(mathCoupons?.summary?.bankroll_tl || autoConfigView?.bankroll)}
        </Text>
        <Text style={{fontSize: 12, color: colors.textMuted}}>
          Oyna = matematiksel avantaj daha guclu, Oynama = avantaj dusuk veya risk daha yuksek.
        </Text>
      </View>

      <View style={{flexDirection: 'row', gap: 8}}>
        <View style={{flex: 1, gap: 6}}>
          <Text style={{fontSize: 12, color: colors.textMuted}}>Banka (TL)</Text>
          <TextInput
            value={bankrollTl}
            onChangeText={onChangeBankrollTl}
            onBlur={onBlurBankrollTl}
            keyboardType="number-pad"
            style={{
              minHeight: 42,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.lineStrong,
              backgroundColor: colors.surface,
              color: colors.text,
              paddingHorizontal: 10,
            }}
          />
        </View>
        <View style={{flex: 1, justifyContent: 'flex-end'}}>
          <GradientButton
            title={loading ? 'Matematiksel Kuponlar Uretiliyor...' : 'Matematiksel Kuponlari Otomatik Uret'}
            onPress={onGenerate}
            loading={loading}
            iconName="stats-chart-outline"
          />
        </View>
      </View>

      {autoConfigView ? (
        <Text style={{fontSize: 12, color: colors.textMuted}}>
          Otomatik Secim: {autoConfigView.daysWindow} gun | Kupon basi {autoConfigView.matchesPerCoupon} mac | Lig:{' '}
          {autoConfigView.leaguesLabel} | Model: {autoConfigView.modelLabel}
        </Text>
      ) : null}

      {taskSnapshot ? (
        <CouponTaskProgress progress={taskSnapshot.progress} stage={taskSnapshot.stage} state={taskSnapshot.state} />
      ) : null}

      {loading && taskSnapshot ? (
        <Text style={{fontSize: 12, color: colors.textMuted}}>Tahmini kalan: {formatEta(etaSeconds)}</Text>
      ) : null}

      {error ? <StatusBanner message={error} tone="error" /> : null}
      {info ? <StatusBanner message={info} tone="success" /> : null}

      {warnings.length ? (
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSoft,
            paddingHorizontal: 10,
            paddingVertical: 8,
            gap: 4,
          }}>
          {warnings.map((warning, index) => (
            <Text key={`math-warning-${index}`} style={{fontSize: 12, color: colors.text}}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{gap: 10}}>
        <StrategyCard
          title="Tekli + dusuk-orta oran"
          strategyTitle="Matematiksel Tekli"
          grouped={singleGrouped}
          targetRangeText={`Hedef oran: ${oddText(mathCoupons?.single_low_mid?.target_odds_range?.min)} - ${oddText(
            mathCoupons?.single_low_mid?.target_odds_range?.max,
          )}`}
          stakeText={`Stake: %${safeNumber(mathCoupons?.single_low_mid?.stake_pct_range?.min, 0) * 100} - %${
            safeNumber(mathCoupons?.single_low_mid?.stake_pct_range?.max, 0) * 100
          } | Oneri ${formatTl(mathCoupons?.single_low_mid?.suggested_stake_tl)}`}
          generatedText={`Uretilen kupon: ${singleItems.length}`}
          warnings={Array.isArray(mathCoupons?.single_low_mid?.warnings) ? mathCoupons?.single_low_mid?.warnings : []}
          skipExpanded={skipExpanded.single}
          onToggleSkip={() => setSkipExpanded(prev => ({...prev, single: !prev.single}))}
          onAddCoupon={onAddCoupon}
          onSaveCoupon={onSaveCoupon}
        />

        <StrategyCard
          title="2'li Sistem"
          strategyTitle="Matematiksel 2li"
          grouped={doubleGrouped}
          targetRangeText={`Hedef oran: ${oddText(mathCoupons?.double_system?.target_odds_range?.min)} - ${oddText(
            mathCoupons?.double_system?.target_odds_range?.max,
          )}`}
          stakeText={`Stake: %${safeNumber(mathCoupons?.double_system?.stake_pct_range?.min, 0) * 100} - %${
            safeNumber(mathCoupons?.double_system?.stake_pct_range?.max, 0) * 100
          } | Oneri ${formatTl(mathCoupons?.double_system?.suggested_stake_tl)}`}
          generatedText={`Uretilen kupon: ${doubleItems.length}`}
          warnings={Array.isArray(mathCoupons?.double_system?.warnings) ? mathCoupons?.double_system?.warnings : []}
          skipExpanded={skipExpanded.double}
          onToggleSkip={() => setSkipExpanded(prev => ({...prev, double: !prev.double}))}
          onAddCoupon={onAddCoupon}
          onSaveCoupon={onSaveCoupon}
        />

        <StrategyCard
          title="Mix Portfoy"
          strategyTitle="Matematiksel Mix"
          grouped={mixGrouped}
          targetRangeText="%70 Tekli / %25 2'li / %5 Shot"
          stakeText={`Tekli ${mixSingleItems.length} | 2'li ${mixDoubleItems.length} | Shot ${mixShotItems.length}`}
          generatedText={`Toplam: ${mixMergedItems.length}`}
          warnings={Array.isArray(mathCoupons?.mix_portfolio?.warnings) ? mathCoupons?.mix_portfolio?.warnings : []}
          showVariant
          skipExpanded={skipExpanded.mix}
          onToggleSkip={() => setSkipExpanded(prev => ({...prev, mix: !prev.mix}))}
          onAddCoupon={onAddCoupon}
          onSaveCoupon={onSaveCoupon}
        />
      </View>
    </View>
  );
}
