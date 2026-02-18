import React from 'react';
import {View, Text} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import Markdown from 'react-native-markdown-display';
import {colors} from '../../theme/colors';
import {ChatQuickPick} from './ChatQuickPick';

type MessageRole = 'user' | 'assistant';

type QuickPick = {
  selection: string;
  selection_display?: string;
  odd: number;
  tone: 'high' | 'low' | 'neutral';
  onPress: () => void;
};

type Props = {
  role: MessageRole;
  content: string;
  timestamp?: string;
  quickPicks?: QuickPick[];
  index: number;
};

function formatTimestamp(value?: string) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatMessage({role, content, timestamp, quickPicks, index}: Props) {
  const isAssistant = role === 'assistant';

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).duration(300)}
      style={{
        alignSelf: isAssistant ? 'stretch' : 'flex-end',
        maxWidth: isAssistant ? '100%' : '92%',
      }}>
      {isAssistant ? (
        <View style={{gap: 8}}>
          <View
            style={{
              borderRadius: 18,
              backgroundColor: '#F5F5F5',
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 8,
            }}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
              <Text style={{fontSize: 11, fontWeight: '600', color: '#1976D2'}}>AI</Text>
              {timestamp ? (
                <Text style={{fontSize: 10, color: '#757575'}}>{formatTimestamp(timestamp)}</Text>
              ) : null}
            </View>

            <Markdown
              style={{
                body: {color: '#212121', fontSize: 14, lineHeight: 21},
                heading2: {color: '#212121', fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 4},
                heading3: {color: '#212121', fontSize: 15, fontWeight: '600', marginTop: 6, marginBottom: 3},
                bullet_list_icon: {color: '#1976D2'},
                bullet_list: {marginTop: 4, marginBottom: 4},
                list_item: {marginTop: 2, marginBottom: 2},
                paragraph: {marginTop: 0, marginBottom: 8},
                strong: {color: '#212121', fontWeight: '700'},
                em: {color: '#757575', fontStyle: 'italic'},
                code_inline: {
                  backgroundColor: '#E3F2FD',
                  color: '#1976D2',
                  paddingHorizontal: 4,
                  paddingVertical: 2,
                  borderRadius: 4,
                  fontSize: 13,
                },
              }}>
              {content.trim()}
            </Markdown>
          </View>

          {quickPicks && quickPicks.length > 0 ? (
            <View style={{gap: 6}}>
              <Text style={{fontSize: 11, color: '#757575', fontWeight: '600'}}>
                Önerilen Bahisler
              </Text>
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
                {quickPicks.map((pick, idx) => (
                  <ChatQuickPick
                    key={`pick-${index}-${idx}`}
                    selection={pick.selection}
                    selectionDisplay={pick.selection_display}
                    odd={pick.odd}
                    tone={pick.tone}
                    onPress={pick.onPress}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            borderRadius: 18,
            backgroundColor: '#E8F5E9',
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 8,
          }}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
            <Text style={{fontSize: 11, fontWeight: '600', color: '#2E7D32'}}>Sen</Text>
            {timestamp ? (
              <Text style={{fontSize: 10, color: '#757575'}}>{formatTimestamp(timestamp)}</Text>
            ) : null}
          </View>

          <Text style={{color: '#212121', fontSize: 14, lineHeight: 20}}>
            {content}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
