import React, {useState, useMemo, useEffect} from 'react';
import {Alert, FlatList, RefreshControl, Text, View, Pressable, TextInput} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAuthStore} from '../../store/authStore';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {GradientButton} from '../../components/common/GradientButton';
import {useCouponApi} from '../../hooks/useCouponApi';
import {useCouponStore} from '../../store/couponStore';
import {messageFromUnknown} from '../../utils/error';
import {StatusBanner} from '../../components/common/StatusBanner';
import {colors} from '../../theme/colors';
import {TeamLogoBadge} from '../../components/common/TeamLogoBadge';
import {CouponDock} from '../../components/coupon/CouponDock';
import {getBottomContentInset, TAB_BAR_HEIGHT} from '../../lib/layout/insets';
import type {DockState} from '../../lib/layout/insets';
import {beginCouponRename, cancelCouponRename, normalizeCouponRenameName} from '../../lib/coupon/renameHelpers';

export function SavedCouponsScreen() {
  const navigation = useNavigation();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const couponApi = useCouponApi();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.navigate('HomeTab' as never, { screen: 'Login' } as never);
    }
  }, [isAuthenticated, navigation]);
  const [mode, setMode] = useState<'active' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dockState, setDockState] = useState<DockState>('collapsed');
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const addPicks = useCouponStore(state => state.addPicks);

  const insets = useSafeAreaInsets();
  const bottomInset = getBottomContentInset(TAB_BAR_HEIGHT, dockState, insets.bottom);

  const savedQuery = useQuery({
    queryKey: ['saved-coupons', mode],
    queryFn: () => couponApi.getSavedCoupons(mode === 'archived'),
  });

  // Filter coupons based on search and risk level
  const filteredCoupons = useMemo(() => {
    let coupons = savedQuery.data?.items || [];
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      coupons = coupons.filter(coupon => 
        coupon.name?.toLowerCase().includes(query) ||
        coupon.items.some(item => 
          item.home_team_name?.toLowerCase().includes(query) ||
          item.away_team_name?.toLowerCase().includes(query)
        )
      );
    }
    
    // Risk filter
    if (riskFilter !== 'all') {
      coupons = coupons.filter(coupon => coupon.risk_level === riskFilter);
    }
    
    return coupons;
  }, [savedQuery.data?.items, searchQuery, riskFilter]);

  const archiveMutation = useMutation({
    mutationFn: (couponId: number) => couponApi.archiveSavedCoupon(couponId),
    onSuccess: async () => {
      setMessage('Kupon arsive tasindi.');
      setError('');
      await queryClient.invalidateQueries({queryKey: ['saved-coupons']});
    },
    onError(e) {
      setError(messageFromUnknown(e, 'Arsivleme basarisiz.'));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (couponId: number) => couponApi.restoreSavedCoupon(couponId),
    onSuccess: async () => {
      setMessage('Kupon geri alindi.');
      setError('');
      await queryClient.invalidateQueries({queryKey: ['saved-coupons']});
    },
    onError(e) {
      setError(messageFromUnknown(e, 'Geri alma basarisiz.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (couponId: number) => couponApi.deleteSavedCoupon(couponId),
    onSuccess: async () => {
      setMessage('Kupon silindi.');
      setError('');
      await queryClient.invalidateQueries({queryKey: ['saved-coupons']});
    },
    onError(e) {
      setError(messageFromUnknown(e, 'Silme basarisiz.'));
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({couponId, name}: {couponId: number; name: string}) => couponApi.renameSavedCoupon(couponId, name),
    onSuccess: async () => {
      setMessage('Kupon adi guncellendi.');
      setError('');
      const reset = cancelCouponRename();
      setEditingCouponId(reset.editingCouponId);
      setEditingName(reset.editingName);
      await queryClient.invalidateQueries({queryKey: ['saved-coupons']});
    },
    onError(e) {
      setError(messageFromUnknown(e, 'Kupon adi guncellenemedi.'));
    },
  });

  return (
    <ScreenContainer scroll={false} preset="plain" disableHorizontalPadding>
      <View style={{flex: 1, paddingHorizontal: 16, paddingTop: 8, gap: 12}}>
        <Text style={{fontSize: 24, fontWeight: '800', color: colors.text}}>Kayıtlı Kuponlar</Text>

        {/* Mode Toggle */}
        <View style={{flexDirection: 'row', gap: 8}}>
          <View style={{flex: 1}}>
            <GradientButton 
              title="Aktif" 
              onPress={() => {
                setMode('active');
                setSearchQuery('');
                setRiskFilter('all');
              }} 
              variant={mode === 'active' ? 'primary' : 'secondary'} 
              size="sm"
            />
          </View>
          <View style={{flex: 1}}>
            <GradientButton 
              title="Arşiv" 
              onPress={() => {
                setMode('archived');
                setSearchQuery('');
                setRiskFilter('all');
              }} 
              variant={mode === 'archived' ? 'primary' : 'secondary'} 
              size="sm"
            />
          </View>
        </View>

        {/* Search Bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          borderRadius: 12,
          paddingHorizontal: 12,
          minHeight: 44,
        }}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Kupon veya takım ara..."
            placeholderTextColor={colors.placeholder}
            style={{
              flex: 1,
              fontSize: 14,
              color: colors.text,
              paddingVertical: 10,
            }}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {/* Risk Filter */}
        <View style={{
          flexDirection: 'row',
          gap: 6,
          backgroundColor: colors.surface,
          borderRadius: 10,
          padding: 4,
        }}>
          {[
            {value: 'all', label: 'Tümü'},
            {value: 'low', label: 'Düşük'},
            {value: 'medium', label: 'Orta'},
            {value: 'high', label: 'Yüksek'},
          ].map(filter => (
            <Pressable
              key={filter.value}
              onPress={() => setRiskFilter(filter.value)}
              style={{
                flex: 1,
                minHeight: 32,
                borderRadius: 8,
                backgroundColor: riskFilter === filter.value ? colors.accentSoft : 'transparent',
                borderWidth: 1,
                borderColor: riskFilter === filter.value ? colors.accentBorder : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Text style={{
                fontSize: 12,
                fontWeight: riskFilter === filter.value ? '700' : '600',
                color: riskFilter === filter.value ? colors.accent : colors.textMuted,
              }}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <StatusBanner message={error} tone="error" /> : null}
        {message ? <StatusBanner message={message} tone="success" /> : null}

        <FlatList
          data={filteredCoupons}
          keyExtractor={item => String(item.id)}
          refreshControl={<RefreshControl refreshing={savedQuery.isFetching} onRefresh={savedQuery.refetch} tintColor={colors.accent} />}
          contentContainerStyle={{gap: 10, paddingBottom: bottomInset}}
          scrollEnabled={dockState !== 'expanded'}
          ListEmptyComponent={
            <View style={{paddingVertical: 40, alignItems: 'center'}}>
              <Ionicons 
                name={searchQuery || riskFilter !== 'all' ? 'search-outline' : 'ticket-outline'} 
                size={48} 
                color={colors.textMuted} 
                style={{opacity: 0.5}} 
              />
              <Text style={{color: colors.textMuted, marginTop: 12, fontSize: 15}}>
                {searchQuery || riskFilter !== 'all' ? 'Sonuç bulunamadı' : 'Kayıtlı kupon yok'}
              </Text>
              {searchQuery || riskFilter !== 'all' ? (
                <Text style={{color: colors.textMuted, fontSize: 12, marginTop: 4}}>
                  Farklı filtreler deneyin
                </Text>
              ) : null}
            </View>
          }
          renderItem={({item}) => (
            <View
              style={{
                backgroundColor: colors.card,
                borderColor: colors.line,
                borderWidth: 1,
                borderRadius: 16,
                padding: 12,
                gap: 8,
              }}>
              {editingCouponId === item.id ? (
                <View style={{gap: 8}}>
                  <TextInput
                    value={editingName}
                    onChangeText={setEditingName}
                    maxLength={120}
                    placeholder="Kupon adi"
                    placeholderTextColor={colors.textMuted}
                    style={{
                      minHeight: 40,
                      borderWidth: 1,
                      borderColor: colors.lineStrong,
                      borderRadius: 10,
                      backgroundColor: colors.surface,
                      color: colors.text,
                      paddingHorizontal: 10,
                    }}
                  />
                  <View style={{flexDirection: 'row', gap: 8}}>
                    <Pressable
                      disabled={renameMutation.isPending}
                      onPress={() => {
                        const trimmed = normalizeCouponRenameName(editingName);
                        if (!trimmed) {
                          setError('Kupon adi bos olamaz.');
                          return;
                        }
                        renameMutation.mutate({couponId: item.id, name: trimmed});
                      }}
                      style={{
                        flex: 1,
                        minHeight: 36,
                        borderRadius: 10,
                        backgroundColor: colors.success,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: renameMutation.isPending ? 0.6 : 1,
                      }}>
                      <Text style={{color: colors.successTextOnSolid, fontWeight: '800'}}>
                        {renameMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const reset = cancelCouponRename();
                        setEditingCouponId(reset.editingCouponId);
                        setEditingName(reset.editingName);
                      }}
                      style={{
                        flex: 1,
                        minHeight: 36,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.lineStrong,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <Text style={{color: colors.text, fontWeight: '700'}}>Iptal</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
                  <Text style={{flex: 1, fontWeight: '700', color: colors.text}}>{item.name}</Text>
                  <Pressable
                    onPress={() => {
                      const next = beginCouponRename(item.id, item.name || '');
                      setEditingCouponId(next.editingCouponId);
                      setEditingName(next.editingName);
                      setError('');
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.line,
                      backgroundColor: colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Ionicons name="create-outline" size={16} color={colors.text} />
                  </Pressable>
                </View>
              )}
              <Text style={{fontSize: 12, color: colors.textMuted}}>
                Mac: {item.items.length} - Oran: {(item.summary?.total_odds || 0).toFixed(2)} - Bedel: {(item.summary?.coupon_amount || 0).toFixed(2)} TL
              </Text>

              {item.items.slice(0, 3).map(match => (
                <View key={`${item.id}-${match.fixture_id}-${match.selection}`} style={{gap: 4}}>
                  <TeamLogoBadge name={match.home_team_name} logo={match.home_team_logo} size="sm" />
                  <TeamLogoBadge name={match.away_team_name} logo={match.away_team_logo} size="sm" />
                  <Text style={{fontSize: 12, color: colors.textMuted}}>{match.selection_display || match.selection}</Text>
                </View>
              ))}

              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                <Pressable
                  onPress={() => {
                    const added = addPicks(item.items);
                    setMessage(`${added} mac sepete eklendi.`);
                  }}
                  style={{
                    borderColor: colors.line,
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: colors.surface,
                  }}>
                  <Text style={{color: colors.text}}>Sepete Ekle</Text>
                </Pressable>

                {mode === 'active' ? (
                  <Pressable
                    onPress={() => archiveMutation.mutate(item.id)}
                    style={{
                      borderColor: colors.line,
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: colors.surface,
                    }}>
                    <Text style={{color: colors.text}}>Arsivle</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => restoreMutation.mutate(item.id)}
                    style={{
                      borderColor: colors.line,
                      borderWidth: 1,
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: colors.surface,
                    }}>
                    <Text style={{color: colors.text}}>Geri Al</Text>
                  </Pressable>
                )}

                <Pressable
                  onPress={() => {
                    Alert.alert('Silme Onayi', 'Kupon kalici olarak silinecek.', [
                      {text: 'Iptal', style: 'cancel'},
                      {text: 'Sil', style: 'destructive', onPress: () => deleteMutation.mutate(item.id)},
                    ]);
                  }}
                  style={{
                    borderColor: colors.dangerSoftStrong,
                    borderWidth: 1,
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: colors.dangerSoft,
                  }}>
                  <Text style={{color: colors.danger}}>Sil</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      </View>

      <CouponDock onStateChange={setDockState} defaultExpanded={false} />
    </ScreenContainer>
  );
}
