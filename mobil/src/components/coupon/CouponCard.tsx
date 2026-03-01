import React from 'react';
import {Pressable, Text, View} from 'react-native';
import type {CouponMatch, RiskCoupon} from '../../types/api';
import {GradientButton} from '../common/GradientButton';
import {oddText} from '../../utils/format';
import {colors} from '../../theme/colors';
import {TeamLogoBadge} from '../common/TeamLogoBadge';

type Props = {
  title: string;
  coupon?: RiskCoupon;
  onAddAll: () => void;
  onSave: () => void;
  onAskAi?: (match: CouponMatch) => void;
};

export function CouponCard({title, coupon, onAddAll, onSave, onAskAi}: Props) {
  const unavailable = !coupon || coupon.unavailable || !Array.isArray(coupon.matches) || coupon.matches.length === 0;
  const strictCount = Number(coupon?.candidate_counts?.strict_count ?? 0);
  const safetyCount = Number(coupon?.candidate_counts?.safety_count ?? 0);

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderColor: colors.line,
        borderWidth: 1,
        padding: 14,
        gap: 10,
      }}>
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
        <Text style={{fontSize: 16, fontWeight: '800', color: colors.text}}>{title}</Text>
        <Text style={{fontSize: 13, color: colors.accent, fontWeight: '700'}}>{oddText(coupon?.total_odds)}</Text>
      </View>

      {Array.isArray(coupon?.warnings) && coupon?.warnings?.length ? (
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
          {coupon.warnings.map((warning, index) => (
            <Text key={`risk-warning-${title}-${index}`} style={{fontSize: 12, color: colors.text}}>
              {warning}
            </Text>
          ))}
        </View>
      ) : null}

      {coupon?.candidate_counts ? (
        <View style={{flexDirection: 'row', gap: 8}}>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.lineStrong,
              backgroundColor: colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
            <Text style={{fontSize: 11, color: colors.textMuted}}>Strict: {strictCount}</Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.lineStrong,
              backgroundColor: colors.surface,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
            <Text style={{fontSize: 11, color: colors.textMuted}}>Fallback: {safetyCount}</Text>
          </View>
        </View>
      ) : null}

      {unavailable ? (
        <Text style={{fontSize: 13, color: colors.textMuted}}>Bu risk seviyesi icin uygun kupon bulunamadi.</Text>
      ) : (
        <>
          {coupon?.matches.map(match => (
            <View key={`${match.fixture_id}-${match.selection}-${match.odd}`} style={{gap: 6}}>
              <TeamLogoBadge name={match.home_team_name} logo={match.home_team_logo} size="sm" />
              <TeamLogoBadge name={match.away_team_name} logo={match.away_team_logo} size="sm" />
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
                <Text style={{fontSize: 12, color: colors.textMuted, flex: 1}} numberOfLines={1}>
                  {match.selection_display || match.selection} - {oddText(match.odd)}
                </Text>
                {onAskAi ? (
                  <Pressable
                    onPress={() => onAskAi(match)}
                    style={{
                      minHeight: 28,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 9,
                    }}>
                    <Text style={{fontSize: 11, color: colors.text, fontWeight: '700'}}>AI'a Sor</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          <View style={{flexDirection: 'row', gap: 8}}>
            <View style={{flex: 1}}>
              <GradientButton title="Kupona Ekle" onPress={onAddAll} iconName="add-circle-outline" />
            </View>
            <View style={{flex: 1}}>
              <GradientButton title="Kaydet" onPress={onSave} variant="secondary" iconName="bookmark-outline" />
            </View>
          </View>
        </>
      )}
    </View>
  );
}
