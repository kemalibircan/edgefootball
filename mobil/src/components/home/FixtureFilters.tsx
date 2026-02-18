import React from 'react';
import {FlatList, Pressable, Text, TextInput, View} from 'react-native';
import type {LeagueOption} from '../../constants/leagues';
import {colors} from '../../theme/colors';

type Props = {
  q: string;
  targetDate: string;
  selectedLeagueId: string;
  selectedGameType: string;
  leagues: LeagueOption[];
  gameTypes: LeagueOption[];
  onChangeQ: (value: string) => void;
  onChangeTargetDate: (value: string) => void;
  onChangeLeague: (value: string) => void;
  onChangeGameType: (value: string) => void;
};

function ChipRow({
  title,
  data,
  selected,
  onSelect,
}: {
  title: string;
  data: LeagueOption[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={{gap: 8}}>
      <Text style={{color: colors.textMuted, fontWeight: '600'}}>{title}</Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={data}
        keyExtractor={item => item.value}
        contentContainerStyle={{gap: 8}}
        renderItem={({item}) => {
          const active = item.value === selected;
          return (
            <Pressable
              onPress={() => onSelect(item.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: active ? colors.accent : colors.line,
                backgroundColor: active ? colors.accentSoft : colors.card,
              }}>
              <Text style={{color: active ? colors.chipActiveText : colors.textMuted, fontWeight: '600'}}>{item.label}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export function FixtureFilters({
  q,
  targetDate,
  selectedLeagueId,
  selectedGameType,
  leagues,
  gameTypes,
  onChangeQ,
  onChangeTargetDate,
  onChangeLeague,
  onChangeGameType,
}: Props) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 16,
        padding: 12,
        gap: 12,
      }}>
      <TextInput
        value={q}
        onChangeText={onChangeQ}
        placeholder="Takim veya lig ara"
        placeholderTextColor={colors.placeholder}
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: colors.cardSoft,
          paddingHorizontal: 12,
          color: colors.text,
        }}
      />

      <TextInput
        value={targetDate}
        onChangeText={onChangeTargetDate}
        placeholder="Tarih (YYYY-MM-DD)"
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.lineStrong,
          backgroundColor: colors.cardSoft,
          paddingHorizontal: 12,
          color: colors.text,
        }}
      />

      <ChipRow title="Lig" data={leagues} selected={selectedLeagueId} onSelect={onChangeLeague} />
      <ChipRow title="Oyun Turu" data={gameTypes} selected={selectedGameType} onSelect={onChangeGameType} />
    </View>
  );
}
