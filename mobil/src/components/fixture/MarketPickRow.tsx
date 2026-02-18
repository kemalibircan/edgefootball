import React, {useMemo, useState} from 'react';
import {Text, View} from 'react-native';
import type {CouponMatch} from '../../types/api';
import {GradientButton} from '../common/GradientButton';
import {oddText} from '../../utils/format';
import {colors} from '../../theme/colors';

type Props = {
  title: string;
  picks: CouponMatch[];
  onAddPick: (pick: CouponMatch) => void;
};

const CARD_GAP = 8;

export function getMarketPickColumns(containerWidth: number) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 3;
  }
  return containerWidth <= 380 ? 2 : 3;
}

export function MarketPickRow({title, picks, onAddPick}: Props) {
  const [containerWidth, setContainerWidth] = useState(0);

  if (!picks.length) {
    return null;
  }

  const columns = getMarketPickColumns(containerWidth);
  const cardWidth = useMemo(() => {
    if (!containerWidth) {
      return undefined;
    }
    return Math.floor((containerWidth - CARD_GAP * (columns - 1)) / columns);
  }, [columns, containerWidth]);
  const fallbackWidth = columns === 2 ? '48%' : '31%';

  return (
    <View style={{gap: 8}}>
      <Text style={{fontWeight: '700', color: colors.text}}>{title}</Text>
      <View
        style={{flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP}}
        onLayout={event => {
          const width = Math.floor(event.nativeEvent.layout.width);
          if (width > 0 && width !== containerWidth) {
            setContainerWidth(width);
          }
        }}>
        {picks.map(pick => (
          <View
            key={`${pick.fixture_id}-${pick.selection}-${pick.market_key}-${pick.line || '-'}`}
            style={{
              width: cardWidth ?? fallbackWidth,
              backgroundColor: colors.card,
              borderColor: colors.line,
              borderWidth: 1,
              borderRadius: 12,
              padding: 8,
              gap: 6,
            }}>
            <Text style={{fontWeight: '700', color: colors.text}}>{pick.selection_display || pick.selection}</Text>
            <Text style={{fontSize: 12, color: colors.textMuted}}>Oran: {oddText(pick.odd)}</Text>
            <GradientButton title="Ekle" onPress={() => onAddPick(pick)} size="sm" />
          </View>
        ))}
      </View>
    </View>
  );
}
