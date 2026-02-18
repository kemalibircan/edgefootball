import React, {useMemo, useState} from 'react';
import {ScrollView, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useMutation} from '@tanstack/react-query';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {HomeStackParamList} from '../../navigation/types';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {GradientButton} from '../../components/common/GradientButton';
import {MarketPickRow} from '../../components/fixture/MarketPickRow';
import {simulateFixture} from '../../lib/api/endpoints';
import {useCouponStore} from '../../store/couponStore';
import type {CouponMatch, FixtureBoardItem} from '../../types/api';
import {asPercent, formatDateTime} from '../../utils/format';
import {messageFromUnknown} from '../../utils/error';
import {TeamLogoBadge} from '../../components/common/TeamLogoBadge';
import {colors} from '../../theme/colors';
import {StatusBanner} from '../../components/common/StatusBanner';
import {CouponDock} from '../../components/coupon/CouponDock';
import {getBottomContentInset, TAB_BAR_HEIGHT} from '../../lib/layout/insets';
import type {DockState} from '../../lib/layout/insets';
import {useAiChat} from '../../state/chat/AiChatContext';

export type FixtureDetailScreenProps = NativeStackScreenProps<HomeStackParamList, 'FixtureDetail'>;

function toPick(item: FixtureBoardItem, selection: string, odd: number, marketKey: string, display: string): CouponMatch {
  return {
    fixture_id: item.fixture_id,
    home_team_name: item.home_team_name,
    away_team_name: item.away_team_name,
    home_team_logo: item.home_team_logo || null,
    away_team_logo: item.away_team_logo || null,
    starting_at: item.starting_at,
    selection,
    selection_display: display,
    market_key: marketKey,
    market_label: marketKey,
    odd,
    league_id: item.league_id,
    league_name: item.league_name,
    source: 'manual',
  };
}

function buildMarketRows(fixture: FixtureBoardItem): Array<{title: string; picks: CouponMatch[]}> {
  const rows: Array<{title: string; picks: CouponMatch[]}> = [];
  const markets = fixture.markets || {};

  const matchResult = markets.match_result;
  if (matchResult) {
    const picks = [
      {selection: '1', odd: Number(matchResult['1'])},
      {selection: '0', odd: Number(matchResult['0'])},
      {selection: '2', odd: Number(matchResult['2'])},
    ]
      .filter(item => Number.isFinite(item.odd) && item.odd > 1)
      .map(item => toPick(fixture, item.selection, item.odd, 'match_result', `MS ${item.selection}`));
    rows.push({title: 'Mac Sonucu', picks});
  }

  const firstHalf = markets.first_half;
  if (firstHalf) {
    const picks = [
      {selection: 'IY-1', odd: Number(firstHalf['1']), display: 'IY 1'},
      {selection: 'IY-0', odd: Number(firstHalf['0']), display: 'IY X'},
      {selection: 'IY-2', odd: Number(firstHalf['2']), display: 'IY 2'},
    ]
      .filter(item => Number.isFinite(item.odd) && item.odd > 1)
      .map(item => toPick(fixture, item.selection, item.odd, 'first_half', item.display));
    rows.push({title: 'Ilk Yari', picks});
  }

  const ou = markets.over_under_25;
  if (ou) {
    const line = String(ou.line || '2.5');
    const picks = [
      {selection: `ALT-${line}`, odd: Number(ou.under), display: `ALT ${line}`},
      {selection: `UST-${line}`, odd: Number(ou.over), display: `UST ${line}`},
    ]
      .filter(item => Number.isFinite(item.odd) && item.odd > 1)
      .map(item => toPick(fixture, item.selection, item.odd, 'over_under_25', item.display));
    rows.push({title: 'Alt / Ust', picks});
  }

  const btts = markets.btts;
  if (btts) {
    const picks = [
      {selection: 'KG-VAR', odd: Number(btts.yes), display: 'KG Var'},
      {selection: 'KG-YOK', odd: Number(btts.no), display: 'KG Yok'},
    ]
      .filter(item => Number.isFinite(item.odd) && item.odd > 1)
      .map(item => toPick(fixture, item.selection, item.odd, 'btts', item.display));
    rows.push({title: 'Karsilikli Gol', picks});
  }

  return rows;
}

export function FixtureDetailScreen({route}: FixtureDetailScreenProps) {
  const fixture = route.params.fixture;
  const addPick = useCouponStore(state => state.addPick);
  const {askFromAction} = useAiChat();

  const [dockState, setDockState] = useState<DockState>('collapsed');
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');

  const insets = useSafeAreaInsets();
  const bottomInset = getBottomContentInset(TAB_BAR_HEIGHT, dockState, insets.bottom);

  const simulationMutation = useMutation({
    mutationFn: () => simulateFixture(fixture.fixture_id),
  });

  const chatAskMutation = useMutation({
    mutationFn: async () => {
      const response = await askFromAction({
        source: 'manual',
        fixture_id: fixture.fixture_id,
        home_team_name: fixture.home_team_name,
        away_team_name: fixture.away_team_name,
        home_team_logo: fixture.home_team_logo || null,
        away_team_logo: fixture.away_team_logo || null,
        league_id: fixture.league_id,
        league_name: fixture.league_name,
        starting_at: fixture.starting_at || null,
        match_label: fixture.match_label,
        question: 'Bu maçı detaylı analiz et ve en güçlü seçimi açıkla.',
        language: 'tr',
      });
      if (!response.ok) {
        throw new Error(response.error || 'AI istegi chat ekranina aktarilamadi.');
      }
      return response;
    },
    onSuccess() {
      setAiSuccessMessage('AI cevabi chat ekranina gonderildi.');
    },
    onError() {
      setAiSuccessMessage('');
    },
  });

  const marketRows = useMemo(() => buildMarketRows(fixture), [fixture]);

  const summary = simulationMutation.data;
  return (
    <ScreenContainer scroll={false} includeTopSafeArea={false} preset="plain" disableHorizontalPadding>
      <View style={{flex: 1}}>
        <ScrollView
          contentContainerStyle={{paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: bottomInset}}
          showsVerticalScrollIndicator={false}
          scrollEnabled={dockState !== 'expanded'}>
          <View
            style={{
              backgroundColor: colors.card,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 16,
              padding: 14,
              gap: 10,
            }}>
            <View style={{gap: 8}}>
              <TeamLogoBadge name={fixture.home_team_name} logo={fixture.home_team_logo} size="lg" />
              <TeamLogoBadge name={fixture.away_team_name} logo={fixture.away_team_logo} size="lg" />
            </View>
            <Text style={{fontSize: 13, color: colors.textMuted}}>
              {fixture.league_name || '-'} - {formatDateTime(fixture.starting_at)}
            </Text>
          </View>

          <View style={{gap: 10}}>
            <Text style={{fontSize: 12, color: colors.textMuted}}>Model secimi otomatik, lig bazli yapiliyor.</Text>
            <GradientButton
              title="Simulasyonu Calistir"
              onPress={() => simulationMutation.mutate()}
              loading={simulationMutation.isPending}
              iconName="analytics-outline"
            />
            <GradientButton
              title="AI'a Sor"
              onPress={() => chatAskMutation.mutate()}
              loading={chatAskMutation.isPending}
              iconName="chatbubble-ellipses-outline"
            />
          </View>

          {simulationMutation.error ? <StatusBanner message={messageFromUnknown(simulationMutation.error, 'Simulasyon hatasi')} tone="error" /> : null}
          {chatAskMutation.error ? <StatusBanner message={messageFromUnknown(chatAskMutation.error, 'AI chat hatasi')} tone="error" /> : null}
          {aiSuccessMessage ? <StatusBanner message={aiSuccessMessage} tone="success" /> : null}

          {summary ? (
            <View
              style={{
                backgroundColor: colors.card,
                borderColor: colors.line,
                borderWidth: 1,
                borderRadius: 16,
                padding: 14,
                gap: 8,
              }}>
              <Text style={{fontSize: 16, fontWeight: '700', color: colors.text}}>Simulasyon Sonucu</Text>
              <Text style={{color: colors.textMuted}}>Ev: {asPercent(summary.outcomes.home_win)}</Text>
              <Text style={{color: colors.textMuted}}>Beraberlik: {asPercent(summary.outcomes.draw)}</Text>
              <Text style={{color: colors.textMuted}}>Dep: {asPercent(summary.outcomes.away_win)}</Text>
              {summary.model?.model_name ? (
                <Text style={{color: colors.textMuted}}>
                  Kullanilan Model: {summary.model.model_name}
                  {summary.model.selection_mode ? ` (${summary.model.selection_mode})` : ''}
                </Text>
              ) : null}
              <Text style={{fontSize: 13, color: colors.textMuted}}>Kredi kalan: {summary.credits_remaining ?? '-'}</Text>
              <Text style={{fontWeight: '700', color: colors.text, marginTop: 6}}>Top Skorlar</Text>
              {(summary.top_scorelines || []).slice(0, 5).map(item => (
                <Text key={`${item.score}-${item.probability}`} style={{fontSize: 13, color: colors.textMuted}}>
                  {item.score} - {asPercent(item.probability)}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{gap: 10}}>
            <Text style={{fontSize: 17, fontWeight: '800', color: colors.text}}>Pazar Secimleri</Text>
            {marketRows.map(row => (
              <MarketPickRow
                key={row.title}
                title={row.title}
                picks={row.picks}
                onAddPick={pick => {
                  addPick(pick);
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
