import React from 'react';
import {Pressable, Text, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import type {FixtureBoardItem} from '../../types/api';
import {formatDateTime, oddText} from '../../utils/format';
import {TeamLogoBadge} from '../common/TeamLogoBadge';
import {LiveScoreBadge} from './LiveScoreBadge';
import {colors} from '../../theme/colors';

type Props = {
  fixture: FixtureBoardItem;
  onPress?: () => void;
};

export function FixtureCard({fixture, onPress}: Props) {
  const match = fixture.markets?.match_result;
  const isLive = fixture.is_live || false;
  const hasScore = fixture.scores && (fixture.scores.home_score !== null || fixture.scores.away_score !== null);

  return (
    <Animated.View entering={FadeInDown.duration(240)}>
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isLive ? '#ef4444' : colors.line,
          borderLeftWidth: isLive ? 4 : 1,
          padding: 14,
          gap: 10,
        }}>
        {/* Header with league and time OR live indicator */}
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
          <Text style={{fontSize: 12, color: colors.textMuted, flex: 1}}>
            {fixture.league_name || '-'} {!isLive && `- ${formatDateTime(fixture.starting_at)}`}
          </Text>
          {isLive && (
            <LiveScoreBadge 
              isLive={isLive} 
              scores={fixture.scores} 
              state={fixture.state}
              status={fixture.status}
              compact={true}
            />
          )}
        </View>

        {/* Teams section */}
        <View style={{gap: 8}}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <TeamLogoBadge name={fixture.home_team_name} logo={fixture.home_team_logo} />
            {hasScore && (
              <Text style={{fontSize: 18, fontWeight: '700', color: colors.text}}>
                {fixture.scores?.home_score ?? 0}
              </Text>
            )}
          </View>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <TeamLogoBadge name={fixture.away_team_name} logo={fixture.away_team_logo} />
            {hasScore && (
              <Text style={{fontSize: 18, fontWeight: '700', color: colors.text}}>
                {fixture.scores?.away_score ?? 0}
              </Text>
            )}
          </View>
        </View>

        {/* Match status for non-live matches */}
        {!isLive && hasScore && fixture.status && (
          <Text style={{fontSize: 11, color: colors.textMuted}}>
            {fixture.status}
          </Text>
        )}

        {/* Odds section - only show if not live or no scores yet */}
        {(!hasScore || !isLive) && match && (
          <View style={{flexDirection: 'row', gap: 12}}>
            <Text style={{fontSize: 13, color: colors.textMuted}}>1: {oddText(match?.['1'])}</Text>
            <Text style={{fontSize: 13, color: colors.textMuted}}>X: {oddText(match?.['0'])}</Text>
            <Text style={{fontSize: 13, color: colors.textMuted}}>2: {oddText(match?.['2'])}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
