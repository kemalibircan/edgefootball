import React from 'react';
import {Pressable, Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useAiChat} from '../../state/chat/AiChatContext';
import {navigationRef} from '../../navigation/navigationRef';
import {colors} from '../../theme/colors';

export function ChatReplyNotice() {
  const insets = useSafeAreaInsets();
  const {replyNotice, dismissReplyNotice, selectThread} = useAiChat();

  if (!replyNotice) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: Math.max(8, insets.top + 4),
        left: 0,
        right: 0,
        zIndex: 140,
        alignItems: 'flex-end',
        paddingHorizontal: 12,
      }}>
      <Pressable
        onPress={() => {
          dismissReplyNotice();
          if (navigationRef.isReady()) {
            navigationRef.navigate('Chat' as never);
          }
          selectThread(replyNotice.threadId).catch(() => undefined);
        }}
        style={{
          maxWidth: 320,
          minHeight: 52,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.noticeBorder,
          backgroundColor: colors.noticeBackground,
          paddingHorizontal: 12,
          paddingVertical: 9,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          shadowColor: colors.shadow,
          shadowOpacity: 0.24,
          shadowRadius: 10,
          shadowOffset: {width: 0, height: 6},
          elevation: 5,
        }}>
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
        <Text style={{flex: 1, color: colors.text, fontSize: 12, lineHeight: 16}}>{replyNotice.message}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
