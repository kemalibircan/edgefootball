import React, {useMemo, useState} from 'react';
import {ActivityIndicator, FlatList, Image, Pressable, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useQuery} from '@tanstack/react-query';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {FixtureCard} from '../../components/fixture/FixtureCard';
import {getFixtureBoard, getShowcasePublic, getSliderPublic} from '../../lib/api/endpoints';
import {LEAGUE_OPTIONS, GAME_TYPE_OPTIONS} from '../../constants/leagues';
import {useUiStore} from '../../store/uiStore';
import {useAuthStore} from '../../store/authStore';
import type {HomeStackParamList} from '../../navigation/types';
import {HomeSlider} from '../../components/home/HomeSlider';
import {ShowcaseOddsSection} from '../../components/home/ShowcaseOddsSection';
import {FixtureFilters} from '../../components/home/FixtureFilters';
import {SectionHeader} from '../../components/common/SectionHeader';
import {StatusBanner} from '../../components/common/StatusBanner';
import {normalizeShowcaseSections, normalizeSliderImages} from '../../lib/adapters/homeAdapters';
import {CouponDock} from '../../components/coupon/CouponDock';
import {colors} from '../../theme/colors';
import {getBottomContentInset, TAB_BAR_HEIGHT} from '../../lib/layout/insets';
import type {DockState} from '../../lib/layout/insets';

export type HomeScreenProps = NativeStackScreenProps<HomeStackParamList, 'Home'>;
const APP_LOGO = require('../../imgs/logo-dark.png');

export function HomeScreen({navigation}: HomeScreenProps) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const lastLeagueId = useUiStore(state => state.lastLeagueId);
  const lastGameType = useUiStore(state => state.lastGameType);
  const setLastLeagueId = useUiStore(state => state.setLastLeagueId);
  const setLastGameType = useUiStore(state => state.setLastGameType);

  const [q, setQ] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [page, setPage] = useState(1);
  const [dockState, setDockState] = useState<DockState>('collapsed');
  const insets = useSafeAreaInsets();
  const bottomInset = getBottomContentInset(TAB_BAR_HEIGHT, dockState, insets.bottom);

  const filters = useMemo(
    () => ({
      page,
      page_size: 40,
      q,
      league_id: lastLeagueId,
      game_type: lastGameType,
      sort: 'asc' as const,
      target_date: targetDate,
    }),
    [lastGameType, lastLeagueId, page, q, targetDate],
  );

  const fixturesQuery = useQuery({
    queryKey: ['fixture-board', filters],
    queryFn: () => getFixtureBoard(filters),
    placeholderData: previousData => previousData,
    staleTime: 5_000,
    refetchInterval: (query) => {
      // Adaptive polling: faster when there are live matches
      const hasLiveMatches = query.state.data?.items?.some(item => item.is_live) || false;
      return hasLiveMatches ? 10_000 : 30_000; // 10s for live, 30s otherwise
    },
  });

  const sliderQuery = useQuery({
    queryKey: ['home-slider'],
    queryFn: getSliderPublic,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const showcaseQuery = useQuery({
    queryKey: ['home-showcase'],
    queryFn: getShowcasePublic,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const sliderImages = useMemo(() => normalizeSliderImages(sliderQuery.data), [sliderQuery.data]);
  const showcaseSections = useMemo(() => normalizeShowcaseSections(showcaseQuery.data), [showcaseQuery.data]);

  return (
    <ScreenContainer scroll={false} preset="plain" disableHorizontalPadding>
      <View style={{flex: 1}}>
        <FlatList
          data={fixturesQuery.data?.items || []}
          keyExtractor={item => String(item.fixture_id)}
          showsVerticalScrollIndicator={false}
          scrollEnabled={dockState !== 'expanded'}
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset, gap: 10}}
          renderItem={({item}) => (
            <FixtureCard fixture={item} onPress={() => navigation.navigate('FixtureDetail', {fixture: item})} />
          )}
          ListHeaderComponent={
            <View style={{gap: 14, marginBottom: 8}}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 18,
                  backgroundColor: colors.card,
                  padding: 14,
                  gap: 12,
                }}>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <Image source={APP_LOGO} resizeMode="contain" style={{width: 42, height: 42, borderRadius: 11}} />
                    <View>
                      <Text style={{fontSize: 27, fontWeight: '800', color: colors.text}}>Edge Football</Text>
                      <Text style={{color: colors.textMuted, marginTop: 2}}>Mobil premium kupon merkezi</Text>
                    </View>
                  </View>
                  <Ionicons name="sparkles" color={colors.accent} size={24} />
                </View>

                {isAuthenticated ? (
                  <>
                    <View style={{flexDirection: 'row', gap: 8}}>
                      <Pressable
                        onPress={() => navigation.getParent()?.navigate('Coupons')}
                        style={{
                          flex: 1,
                          minHeight: 42,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.lineStrong,
                          backgroundColor: colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 6,
                        }}>
                        <Ionicons name="ticket-outline" size={16} color={colors.text} />
                        <Text style={{color: colors.text, fontWeight: '700'}}>Kuponlar</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => navigation.getParent()?.navigate('SavedCoupons')}
                        style={{
                          flex: 1,
                          minHeight: 42,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.lineStrong,
                          backgroundColor: colors.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          gap: 6,
                        }}>
                        <Ionicons name="albums-outline" size={16} color={colors.text} />
                        <Text style={{color: colors.text, fontWeight: '700'}}>Kaydedilenler</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => navigation.navigate('Profile')}
                      style={{
                        minHeight: 42,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.lineStrong,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}>
                      <Ionicons name="person-circle-outline" size={16} color={colors.text} />
                      <Text style={{color: colors.text, fontWeight: '700'}}>Profil</Text>
                    </Pressable>
                  </>
                ) : (
                  <View style={{flexDirection: 'row', gap: 8, flexWrap: 'wrap'}}>
                    <Pressable
                      onPress={() => navigation.navigate('Login')}
                      style={{
                        flex: 1,
                        minHeight: 42,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.accent,
                        backgroundColor: colors.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}>
                      <Ionicons name="log-in-outline" size={16} color="#fff" />
                      <Text style={{color: '#fff', fontWeight: '700'}}>Giriş Yap</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => navigation.navigate('Register')}
                      style={{
                        flex: 1,
                        minHeight: 42,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.lineStrong,
                        backgroundColor: colors.surface,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 6,
                      }}>
                      <Ionicons name="person-add-outline" size={16} color={colors.text} />
                      <Text style={{color: colors.text, fontWeight: '700'}}>Kayıt Ol</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <HomeSlider images={sliderImages} />

              <ShowcaseOddsSection title="Vitrin Oranlar" section={showcaseSections.popular} />
              <ShowcaseOddsSection title="One Cikan Maclar" section={showcaseSections.featured} />

              <SectionHeader title="Fixture Board" subtitle="Canli filtrelerle maclari daralt" />
              <FixtureFilters
                q={q}
                targetDate={targetDate}
                selectedLeagueId={lastLeagueId}
                selectedGameType={lastGameType}
                leagues={LEAGUE_OPTIONS}
                gameTypes={GAME_TYPE_OPTIONS}
                onChangeQ={value => {
                  setQ(value);
                  setPage(1);
                }}
                onChangeTargetDate={value => {
                  setTargetDate(value);
                  setPage(1);
                }}
                onChangeLeague={value => {
                  setLastLeagueId(value);
                  setPage(1);
                }}
                onChangeGameType={value => {
                  setLastGameType(value);
                  setPage(1);
                }}
              />

              {sliderQuery.error ? (
                <StatusBanner tone="warning" message="Slider servisine erisilemedi. Varsayilan gorseller kullaniliyor." />
              ) : null}
              {showcaseQuery.error ? (
                <StatusBanner tone="warning" message="Vitrin verisi alinamadi. Sadece fixture listesi gosteriliyor." />
              ) : null}

              <SectionHeader title="Maclar" subtitle={`Sayfa ${fixturesQuery.data?.page || page}`} />
            </View>
          }
          ListEmptyComponent={
            fixturesQuery.isLoading ? (
              <View style={{paddingVertical: 24}}>
                <ActivityIndicator color={colors.accent} size="large" />
              </View>
            ) : (
              <Text style={{color: colors.textMuted}}>Filtreye uygun mac bulunamadi.</Text>
            )
          }
          ListFooterComponent={
            fixturesQuery.data ? (
              <View style={{flexDirection: 'row', gap: 8, marginTop: 8}}>
                <Pressable
                  disabled={(fixturesQuery.data.page || 1) <= 1}
                  onPress={() => setPage(p => Math.max(1, p - 1))}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.line,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: (fixturesQuery.data.page || 1) <= 1 ? 0.45 : 1,
                  }}>
                  <Text style={{color: colors.text}}>Onceki</Text>
                </Pressable>
                <Pressable
                  disabled={(fixturesQuery.data.page || 1) >= (fixturesQuery.data.total_pages || 1)}
                  onPress={() => setPage(p => p + 1)}
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.line,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    opacity: (fixturesQuery.data.page || 1) >= (fixturesQuery.data.total_pages || 1) ? 0.45 : 1,
                  }}>
                  <Text style={{color: colors.text}}>Sonraki</Text>
                </Pressable>
              </View>
            ) : null
          }
        />

        <CouponDock onStateChange={setDockState} defaultExpanded={false} />
      </View>
    </ScreenContainer>
  );
}
