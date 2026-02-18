import React from 'react';
import {FlatList, Text, View} from 'react-native';
import type {ShowcaseSection} from '../../types/api';
import {TeamLogoBadge} from '../common/TeamLogoBadge';
import {oddText} from '../../utils/format';
import {colors} from '../../theme/colors';

type Props = {
  title: string;
  section?: ShowcaseSection;
};

function scoreLabel(home: number | null | undefined, away: number | null | undefined) {
  if (home === null || home === undefined || away === null || away === undefined) {
    return 'Skor bekleniyor';
  }
  return `${home}-${away}`;
}

export function ShowcaseOddsSection({title, section}: Props) {
  const items = section?.items || [];

  return (
    <View style={{gap: 10}}>
      <Text style={{fontSize: 17, color: colors.text, fontWeight: '800'}}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        keyExtractor={(item, idx) => `${item.fixture_id || idx}-${idx}`}
        ListEmptyComponent={<Text style={{color: colors.textMuted}}>Bu alan icin veri bulunamadi.</Text>}
        contentContainerStyle={{gap: 10}}
        renderItem={({item}) => (
          <View
            style={{
              width: 260,
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 12,
              gap: 8,
            }}>
            <View style={{gap: 6}}>
              <TeamLogoBadge name={item.home_team_name || '-'} logo={item.home_team_logo} size="sm" />
              <TeamLogoBadge name={item.away_team_name || '-'} logo={item.away_team_logo} size="sm" />
            </View>

            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{color: colors.textMuted, fontSize: 12}}>1: {oddText(item.odd_home)}</Text>
              <Text style={{color: colors.textMuted, fontSize: 12}}>X: {oddText(item.odd_draw)}</Text>
              <Text style={{color: colors.textMuted, fontSize: 12}}>2: {oddText(item.odd_away)}</Text>
            </View>

            <Text style={{color: colors.accent, fontWeight: '700', fontSize: 12}}>
              Model Skor: {scoreLabel(item.model_score_home, item.model_score_away)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
