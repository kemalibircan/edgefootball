import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Dimensions, FlatList, ImageBackground, Pressable, Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {colors} from '../../theme/colors';

const {width: screenWidth} = Dimensions.get('window');
const SLIDE_WIDTH = Math.max(280, screenWidth - 32);

type Props = {
  images: string[];
};

export function HomeSlider({images}: Props) {
  const listRef = useRef<FlatList<string>>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const safeImages = useMemo(() => (images.length ? images : []), [images]);

  useEffect(() => {
    if (safeImages.length <= 1) {
      return;
    }

    const timer = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % safeImages.length;
        listRef.current?.scrollToIndex({index: next, animated: true});
        return next;
      });
    }, 4500);

    return () => clearInterval(timer);
  }, [safeImages.length]);

  if (!safeImages.length) {
    return null;
  }

  return (
    <View style={{gap: 10}}>
      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        data={safeImages}
        keyExtractor={(item, idx) => `${item}-${idx}`}
        onMomentumScrollEnd={event => {
          const idx = Math.round(event.nativeEvent.contentOffset.x / SLIDE_WIDTH);
          if (idx >= 0 && idx < safeImages.length) {
            setActiveIndex(idx);
          }
        }}
        getItemLayout={(_, index) => ({length: SLIDE_WIDTH, offset: SLIDE_WIDTH * index, index})}
        renderItem={({item}) => (
          <ImageBackground
            source={{uri: item}}
            imageStyle={{borderRadius: 18}}
            style={{
              width: SLIDE_WIDTH,
              height: 166,
              borderRadius: 18,
              overflow: 'hidden',
              justifyContent: 'space-between',
              padding: 14,
            }}>
            <View
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                backgroundColor: colors.sliderOverlay,
              }}
            />
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
              <Ionicons name="flash" size={14} color={colors.sliderTitle} />
              <Text style={{color: colors.sliderTitle, fontWeight: '700'}}>Canli Promosyon Alani</Text>
            </View>
            <View>
              <Text style={{color: colors.sliderBody, fontSize: 19, fontWeight: '800'}}>Yapay Zeka Destekli Kupon Onerileri</Text>
              <Text style={{color: colors.sliderCaption, marginTop: 4}}>Gunun trend maclarini tek ekranda yakala.</Text>
            </View>
          </ImageBackground>
        )}
      />

      <View style={{flexDirection: 'row', justifyContent: 'center', gap: 6}}>
        {safeImages.map((_, index) => (
          <Pressable
            key={`dot-${index}`}
            onPress={() => {
              listRef.current?.scrollToIndex({index, animated: true});
              setActiveIndex(index);
            }}
            style={{
              width: index === activeIndex ? 22 : 8,
              height: 8,
              borderRadius: 99,
              backgroundColor: index === activeIndex ? colors.accent : colors.lineStrong,
            }}
          />
        ))}
      </View>
    </View>
  );
}
