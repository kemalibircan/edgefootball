import React, {useEffect, useMemo, useState} from 'react';
import {Dimensions, Pressable, ScrollView, Text, View, Alert, TextInput} from 'react-native';
import {useMutation} from '@tanstack/react-query';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Animated, {FadeIn, FadeOut, Layout} from 'react-native-reanimated';
import {useCouponStore, calculateTotalOdds} from '../../store/couponStore';
import {oddText} from '../../utils/format';
import {colors} from '../../theme/colors';
import {TeamLogoBadge} from '../common/TeamLogoBadge';
import type {DockState} from '../../lib/layout/insets';
import {DOCK_COLLAPSED_HEIGHT} from '../../lib/layout/insets';
import {useCouponApi} from '../../hooks/useCouponApi';
import {messageFromUnknown} from '../../utils/error';
import {buildAutoSaveCouponPayload, canAutoSaveCoupon} from '../../lib/coupon/autoSave';
import {CouponNameModal} from './CouponNameModal';

const screenHeight = Dimensions.get('window').height;

type Props = {
  defaultExpanded?: boolean;
  bottomOffset?: number;
  maxHeightRatio?: number;
  compactOnly?: boolean;
  onStateChange?: (state: DockState) => void;
};

export function CouponDock({
  defaultExpanded = false,
  bottomOffset = 12,
  maxHeightRatio = 0.48,
  compactOnly = false,
  onStateChange,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [saveFeedback, setSaveFeedback] = useState('');
  const [saveFeedbackTone, setSaveFeedbackTone] = useState<'success' | 'error' | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const couponApi = useCouponApi();
  const items = useCouponStore(state => state.items);
  const couponCount = useCouponStore(state => state.couponCount);
  const stake = useCouponStore(state => state.stake);
  const removePick = useCouponStore(state => state.removePick);
  const clearSlip = useCouponStore(state => state.clearSlip);
  const setCouponCount = useCouponStore(state => state.setCouponCount);
  const setStake = useCouponStore(state => state.setStake);
  const insets = useSafeAreaInsets();

  const state: DockState = compactOnly ? 'collapsed' : expanded ? 'expanded' : 'collapsed';
  const maxSheetHeight = Math.max(220, Math.floor(screenHeight * maxHeightRatio));
  const panelBottom = bottomOffset + Math.max(2, insets.bottom - 4);

  const summary = useMemo(() => {
    const totalOdds = calculateTotalOdds(items);
    const couponAmount = couponCount * stake;
    const maxWin = couponAmount * totalOdds;
    return {
      totalOdds,
      couponAmount,
      maxWin,
    };
  }, [couponCount, items, stake]);

  const saveMutation = useMutation({
    mutationFn: async (couponName: string) => {
      if (!items.length) {
        throw new Error('Sepette seçim yok.');
      }
      const payload = buildAutoSaveCouponPayload({items, couponCount, stake});
      return couponApi.saveCoupon({...payload, name: couponName});
    },
    onSuccess() {
      setSaveFeedbackTone('success');
      setSaveFeedback('Kupon başarıyla kaydedildi!');
      setShowNameModal(false);
      // Clear slip after successful save
      setTimeout(() => {
        clearSlip();
        setSaveFeedback('');
        setSaveFeedbackTone(null);
      }, 2000);
    },
    onError(error) {
      setSaveFeedbackTone('error');
      setSaveFeedback(messageFromUnknown(error, 'Kupon kaydedilemedi.'));
      setShowNameModal(false);
    },
  });

  const handleSave = (name: string) => {
    saveMutation.mutate(name);
  };

  const handleClearSlip = () => {
    if (items.length === 0) return;
    
    Alert.alert(
      'Sepeti Temizle',
      'Tüm seçimleri silmek istediğinize emin misiniz?',
      [
        {text: 'İptal', style: 'cancel'},
        {
          text: 'Temizle',
          style: 'destructive',
          onPress: () => {
            clearSlip();
            setSaveFeedback('');
            setSaveFeedbackTone(null);
          },
        },
      ],
    );
  };

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  useEffect(() => {
    if (!items.length && saveFeedbackTone === 'success') {
      setSaveFeedback('');
      setSaveFeedbackTone(null);
    }
  }, [items.length, saveFeedbackTone]);

  const isSaveEnabled = canAutoSaveCoupon(items.length, saveMutation.isPending);

  return (
    <View pointerEvents="box-none" style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0}}>
      {state === 'expanded' ? (
        <Pressable
          onPress={() => setExpanded(false)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: colors.overlayBackdropStrong,
          }}
        />
      ) : null}

      <View
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: panelBottom,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: colors.backgroundElevated,
          overflow: 'hidden',
          shadowColor: colors.shadow,
          shadowOpacity: 0.26,
          shadowRadius: 20,
          shadowOffset: {width: 0, height: 12},
          elevation: 8,
        }}>
        <Pressable
          onPress={() => {
            if (compactOnly) {
              return;
            }
            setExpanded(prev => !prev);
          }}
          style={{
            minHeight: DOCK_COLLAPSED_HEIGHT,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Ionicons name="ticket" color={colors.warning} size={17} />
            <Text style={{color: colors.text, fontWeight: '800'}}>Kupon Sepeti</Text>
            <Text style={{color: colors.textMuted}}>{items.length} mac</Text>
          </View>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <Text style={{color: colors.accent, fontWeight: '700'}}>{oddText(summary.totalOdds)}</Text>
            {!compactOnly ? (
              <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} color={colors.textMuted} size={18} />
            ) : null}
          </View>
        </Pressable>

        {state === 'expanded' && !compactOnly ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.line,
              paddingHorizontal: 10,
              paddingBottom: 10,
              paddingTop: 8,
              gap: 10,
              maxHeight: maxSheetHeight,
            }}>
            <ScrollView style={{maxHeight: maxSheetHeight - 240}} contentContainerStyle={{gap: 8}} showsVerticalScrollIndicator={false}>
              {items.length ? (
                items.map(item => (
                  <Animated.View
                    key={item.pick_key}
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    layout={Layout.springify()}
                    style={{
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.cardSoft,
                      padding: 10,
                      gap: 6,
                    }}>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                      <View style={{gap: 5, flex: 1}}>
                        <TeamLogoBadge name={item.home_team_name} logo={item.home_team_logo} size="sm" />
                        <TeamLogoBadge name={item.away_team_name} logo={item.away_team_logo} size="sm" />
                      </View>
                      <Pressable 
                        onPress={() => removePick(item.pick_key)}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: colors.dangerSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                        <Ionicons name="close" size={16} color={colors.danger} />
                      </Pressable>
                    </View>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                      <Text style={{color: colors.textMuted, fontSize: 12, flex: 1}}>
                        {item.selection_display || item.selection}
                      </Text>
                      <Text style={{color: colors.accent, fontSize: 13, fontWeight: '700'}}>
                        {oddText(item.odd)}
                      </Text>
                    </View>
                  </Animated.View>
                ))
              ) : (
                <View style={{paddingVertical: 20, alignItems: 'center'}}>
                  <Ionicons name="ticket-outline" size={40} color={colors.textMuted} style={{opacity: 0.5}} />
                  <Text style={{color: colors.textMuted, marginTop: 8}}>Sepette seçim yok</Text>
                  <Text style={{color: colors.textMuted, fontSize: 11, marginTop: 4}}>
                    Maç seçerek kupona ekle
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Inline editing for coupon count and stake */}
            <View style={{gap: 10}}>
              <View style={{flexDirection: 'row', gap: 10}}>
                <View style={{flex: 1, gap: 4}}>
                  <Text style={{fontSize: 11, color: colors.textMuted, fontWeight: '600'}}>
                    Kupon Sayısı
                  </Text>
                  <TextInput
                    value={String(couponCount)}
                    onChangeText={(value) => {
                      const num = parseInt(value) || 1;
                      setCouponCount(Math.max(1, Math.min(100, num)));
                    }}
                    keyboardType="number-pad"
                    style={{
                      minHeight: 40,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.lineStrong,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                  />
                </View>
                <View style={{flex: 1, gap: 4}}>
                  <Text style={{fontSize: 11, color: colors.textMuted, fontWeight: '600'}}>
                    Miktar (TL)
                  </Text>
                  <TextInput
                    value={String(stake)}
                    onChangeText={(value) => {
                      const num = parseInt(value) || 1;
                      setStake(Math.max(1, Math.min(10000, num)));
                    }}
                    keyboardType="number-pad"
                    style={{
                      minHeight: 40,
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.lineStrong,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      color: colors.text,
                      fontSize: 14,
                      fontWeight: '600',
                    }}
                  />
                </View>
              </View>

              <View style={{
                backgroundColor: colors.accentSoft,
                borderRadius: 10,
                padding: 10,
                gap: 4,
              }}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <Text style={{color: colors.textMuted, fontSize: 12}}>Kupon Bedeli:</Text>
                  <Text style={{color: colors.text, fontSize: 12, fontWeight: '700'}}>
                    {summary.couponAmount.toFixed(2)} TL
                  </Text>
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                  <Text style={{color: colors.textMuted, fontSize: 12}}>Maks Kazanç:</Text>
                  <Text style={{color: colors.accent, fontSize: 14, fontWeight: '800'}}>
                    {summary.maxWin.toFixed(2)} TL
                  </Text>
                </View>
              </View>
            </View>

            {saveFeedback ? (
              <Text style={{fontSize: 12, color: saveFeedbackTone === 'error' ? colors.danger : colors.success}}>{saveFeedback}</Text>
            ) : null}

            <View style={{flexDirection: 'row', gap: 8}}>
              <Pressable
                onPress={() => setShowNameModal(true)}
                disabled={!isSaveEnabled}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'transparent',
                  backgroundColor: isSaveEnabled ? colors.success : colors.successSoftStrong,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}>
                <Ionicons 
                  name="save-outline" 
                  size={18} 
                  color={isSaveEnabled ? colors.successTextOnSolid : colors.textMuted} 
                />
                <Text style={{
                  color: isSaveEnabled ? colors.successTextOnSolid : colors.textMuted, 
                  fontWeight: '800',
                  fontSize: 14,
                }}>
                  Kuponu Kaydet
                </Text>
              </Pressable>
              <Pressable
                onPress={handleClearSlip}
                style={{
                  minHeight: 44,
                  width: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.dangerBorder,
                  backgroundColor: colors.dangerSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>

            <CouponNameModal
              visible={showNameModal}
              onClose={() => setShowNameModal(false)}
              onSave={handleSave}
              loading={saveMutation.isPending}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}
