import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {FadeIn} from 'react-native-reanimated';
import {ScreenContainer} from '../../components/common/ScreenContainer';
import {TeamLogoBadge} from '../../components/common/TeamLogoBadge';
import {StatusBanner} from '../../components/common/StatusBanner';
import {useAiChat} from '../../state/chat/AiChatContext';
import {useCouponStore} from '../../store/couponStore';
import {buildOneXTwoQuickPicks, compactChatText} from '../../lib/chat/quickPicks';
import {
  buildCouponAutoAskPayload,
  groupCouponItemsByFixture,
  type CouponFixtureEntry,
  type CouponOverlayItem,
} from '../../lib/chat/couponOverlay';
import {colors} from '../../theme/colors';
import {oddText} from '../../utils/format';
import {ChatMessage} from '../../components/chat/ChatMessage';
import {ChatTypingIndicator} from '../../components/chat/ChatTypingIndicator';
import {ChatComposer} from '../../components/chat/ChatComposer';
import LinearGradient from 'react-native-linear-gradient';

const PANEL_ANIMATION_MS = 220;

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

function formatStamp(value?: string | null) {
  if (!value) {
    return '-';
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return String(value);
  }
  return dt.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatKickoff(value?: string | null) {
  if (!value) {
    return '-';
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return String(value);
  }
  return dt.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function matchLabel(home?: string | null, away?: string | null, fallback?: string | null) {
  const homeName = String(home || '').trim();
  const awayName = String(away || '').trim();
  if (homeName && awayName) {
    return `${homeName} - ${awayName}`;
  }
  return String(fallback || 'Mac secimi bekleniyor');
}

export function ChatScreen() {
  const {
    threads,
    threadsLoading,
    threadsError,
    activeThreadId,
    activeThread,
    activeMessages,
    messagesLoading,
    messagesError,
    searchQuery,
    searchResults,
    searchLoading,
    searchError,
    selectedFixture,
    sending,
    sendError,
    selectThread,
    searchFixtures,
    selectFixtureForNewChat,
    sendMessage,
    askFromAction,
  } = useAiChat();

  const couponItems = useCouponStore(state => state.items);
  const addPick = useCouponStore(state => state.addPick);

  const [composer, setComposer] = useState('');
  const [historyQuery, setHistoryQuery] = useState(searchQuery || '');
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [couponVisible, setCouponVisible] = useState(false);
  const [autoAskFixtureId, setAutoAskFixtureId] = useState<number | null>(null);

  const historyAnim = useRef(new RNAnimated.Value(0)).current;
  const couponAnim = useRef(new RNAnimated.Value(0)).current;
  const scrollRef = useRef<ScrollView | null>(null);

  const {width: screenWidth} = useWindowDimensions();
  const historyPanelWidth = Math.min(340, Math.max(260, screenWidth * 0.84));
  const couponPanelWidth = Math.min(360, Math.max(270, screenWidth * 0.86));

  const historyTranslateX = useMemo(
    () =>
      historyAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-historyPanelWidth, 0],
      }),
    [historyAnim, historyPanelWidth],
  );

  const couponTranslateX = useMemo(
    () =>
      couponAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [couponPanelWidth, 0],
      }),
    [couponAnim, couponPanelWidth],
  );

  const couponEntries = useMemo(
    () => groupCouponItemsByFixture((couponItems as unknown as CouponOverlayItem[]) || []),
    [couponItems],
  );

  const selectedMatch = useMemo(
    () =>
      matchLabel(
        selectedFixture?.home_team_name,
        selectedFixture?.away_team_name,
        selectedFixture?.match_label || activeThread?.match_label,
      ),
    [activeThread?.match_label, selectedFixture?.away_team_name, selectedFixture?.home_team_name, selectedFixture?.match_label],
  );

  const animatePanel = useCallback((value: RNAnimated.Value, toValue: number, done?: () => void) => {
    RNAnimated.timing(value, {
      toValue,
      duration: PANEL_ANIMATION_MS,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) {
        done?.();
      }
    });
  }, []);

  const closeHistoryPanel = useCallback(
    (immediate = false) => {
      if (!historyVisible && !immediate) {
        return;
      }
      if (immediate) {
        historyAnim.stopAnimation();
        historyAnim.setValue(0);
        setHistoryVisible(false);
        return;
      }
      animatePanel(historyAnim, 0, () => {
        setHistoryVisible(false);
      });
    },
    [animatePanel, historyAnim, historyVisible],
  );

  const closeCouponPanel = useCallback(
    (immediate = false) => {
      if (!couponVisible && !immediate) {
        return;
      }
      if (immediate) {
        couponAnim.stopAnimation();
        couponAnim.setValue(0);
        setCouponVisible(false);
        return;
      }
      animatePanel(couponAnim, 0, () => {
        setCouponVisible(false);
      });
    },
    [animatePanel, couponAnim, couponVisible],
  );

  const openHistoryPanel = useCallback(() => {
    closeCouponPanel(true);
    setHistoryVisible(true);
    historyAnim.setValue(0);
    animatePanel(historyAnim, 1);
  }, [animatePanel, closeCouponPanel, historyAnim]);

  const openCouponPanel = useCallback(() => {
    closeHistoryPanel(true);
    setCouponVisible(true);
    couponAnim.setValue(0);
    animatePanel(couponAnim, 1);
  }, [animatePanel, closeHistoryPanel, couponAnim]);

  const toggleHistoryPanel = useCallback(() => {
    if (historyVisible) {
      closeHistoryPanel();
      return;
    }
    openHistoryPanel();
  }, [closeHistoryPanel, historyVisible, openHistoryPanel]);

  const toggleCouponPanel = useCallback(() => {
    if (couponVisible) {
      closeCouponPanel();
      return;
    }
    openCouponPanel();
  }, [closeCouponPanel, couponVisible, openCouponPanel]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (couponVisible) {
          closeCouponPanel();
          return true;
        }
        if (historyVisible) {
          closeHistoryPanel();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [closeCouponPanel, closeHistoryPanel, couponVisible, historyVisible]),
  );

  useEffect(() => {
    if (!historyVisible) {
      return;
    }
    const timer = setTimeout(() => {
      searchFixtures(historyQuery, {limit: 20}).catch(() => undefined);
    }, 240);
    return () => clearTimeout(timer);
  }, [historyQuery, historyVisible, searchFixtures]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({animated: true});
    }, 60);
    return () => clearTimeout(timer);
  }, [activeMessages.length, sending]);

  const handleAutoAskFromCoupon = useCallback(
    async (entry: CouponFixtureEntry) => {
      setAutoAskFixtureId(entry.fixture_id);
      const payload = buildCouponAutoAskPayload(entry);
      const result = await askFromAction(payload);
      setAutoAskFixtureId(null);

      if (!result.ok) {
        setFeedback({
          tone: 'error',
          message: result.error || 'AI istegi gonderilemedi.',
        });
        return;
      }

      setFeedback({
        tone: 'success',
        message: 'Kupondaki mac AI sohbetine gonderildi.',
      });

      closeCouponPanel();
    },
    [askFromAction, closeCouponPanel],
  );

  // Auto-dismiss feedback after 5 seconds
  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timer = setTimeout(() => {
      setFeedback(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [feedback]);

  return (
    <ScreenContainer scroll={false} preset="plain" disableHorizontalPadding>
      <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{flex: 1}}>
          <View
            style={{
              minHeight: 56,
              overflow: 'visible',
            }}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                backgroundColor: '#FFFFFF',
                borderBottomWidth: 1,
                borderBottomColor: '#E0E0E0',
              }}>
              <Pressable
                testID="chat-history-toggle"
                onPress={toggleHistoryPanel}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  backgroundColor: '#F5F5F5',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="menu" size={20} color="#212121" />
              </Pressable>

              <View style={{flex: 1, alignItems: 'center', gap: 2}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: '#E3F2FD',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <Ionicons name="chatbubbles" size={14} color="#1976D2" />
                  </View>
                  <Text style={{fontSize: 17, fontWeight: '800', color: '#212121'}}>AI Chat</Text>
                </View>
                <Text style={{fontSize: 11, color: '#757575'}} numberOfLines={1}>
                  {selectedMatch}
                </Text>
              </View>

              <Pressable
                testID="chat-coupon-toggle"
                onPress={toggleCouponPanel}
                style={{
                  minWidth: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  backgroundColor: '#F5F5F5',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 8,
                }}>
                <Ionicons name="ticket" size={20} color="#212121" />
                {couponEntries.length ? (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      minWidth: 20,
                      height: 20,
                      borderRadius: 10,
                      backgroundColor: '#FF9800',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 5,
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                    }}>
                    <Text style={{fontSize: 11, fontWeight: '800', color: '#FFFFFF'}}>
                      {couponEntries.length}
                    </Text>
                  </Animated.View>
                ) : null}
              </Pressable>
            </View>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              overflow: 'visible',
            }}>
            <ScrollView
              ref={scrollRef}
              style={{flex: 1}}
              contentContainerStyle={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                gap: 12,
                flexGrow: 1,
              }}
              showsVerticalScrollIndicator={false}>
              {messagesLoading ? <ActivityIndicator color="#1976D2" /> : null}
              {messagesError ? <StatusBanner message={messagesError} tone="error" /> : null}

              {!messagesLoading && !messagesError && !activeMessages.length ? (
                <View
                  style={{
                    paddingVertical: 40,
                    alignItems: 'center',
                    gap: 12,
                  }}>
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      backgroundColor: '#E3F2FD',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#90CAF9',
                    }}>
                    <Ionicons name="chatbubbles" size={32} color="#1976D2" />
                  </View>
                  <View style={{gap: 6, alignItems: 'center', maxWidth: 280}}>
                    <Text style={{fontSize: 16, fontWeight: '700', color: '#212121', textAlign: 'center'}}>
                      AI Chat'e Hoş Geldin
                    </Text>
                    <Text style={{color: '#757575', fontSize: 13, textAlign: 'center', lineHeight: 19}}>
                      Soldan maç seç veya arama yap. AI asistanı maç analizi ve tahmin konusunda sana yardımcı olacak.
                    </Text>
                  </View>
                </View>
              ) : null}

              {activeMessages.map((message, index) => {
                const isAssistant = String(message.role) === 'assistant';
                const picks = isAssistant ? buildOneXTwoQuickPicks(activeThread, message) : [];
                const quickPicksData = picks.map(pick => ({
                  selection: pick.selection,
                  selection_display: pick.selection_display || pick.selection,
                  odd: pick.odd,
                  tone: pick.tone,
                  onPress: () => {
                    addPick(pick);
                    setFeedback({
                      tone: 'success',
                      message: `${pick.selection_display || pick.selection} kupona eklendi.`,
                    });
                  },
                }));

                return (
                  <ChatMessage
                    key={`chat-message-${message.id}`}
                    role={isAssistant ? 'assistant' : 'user'}
                    content={String(message.content_markdown || '').trim()}
                    timestamp={message.created_at || undefined}
                    quickPicks={quickPicksData.length > 0 ? quickPicksData : undefined}
                    index={index}
                  />
                );
              })}

              {sending ? <ChatTypingIndicator /> : null}
            </ScrollView>

            <View style={{
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 12,
              paddingVertical: 8,
              gap: 6,
              borderTopWidth: 1,
              borderTopColor: '#E0E0E0',
            }}>
              {sendError ? <StatusBanner message={sendError} tone="error" /> : null}
              {feedback ? (
                <Animated.View entering={FadeIn.duration(200)}>
                  <StatusBanner message={feedback.message} tone={feedback.tone} />
                </Animated.View>
              ) : null}
              
              <ChatComposer
                value={composer}
                onChangeText={setComposer}
                onSend={async () => {
                  const response = await sendMessage({
                    question: composer,
                    source: 'manual',
                    language: 'tr',
                  });
                  if (response.ok) {
                    setComposer('');
                  }
                }}
                placeholder="Seçili maç hakkında soru sor..."
                sending={sending}
                selectedFixture={!!selectedFixture}
              />
            </View>
          </View>

          {historyVisible ? (
            <View pointerEvents="box-none" style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50}}>
              <Pressable
                testID="chat-history-backdrop"
                onPress={() => closeHistoryPanel()}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: colors.overlayBackdrop,
                }}
              />
              <RNAnimated.View
                testID="chat-history-panel"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: historyPanelWidth,
                  borderRightWidth: 1,
                  borderRightColor: colors.lineStrong,
                  backgroundColor: colors.backgroundElevated,
                  paddingTop: 16,
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  transform: [{translateX: historyTranslateX}],
                }}>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: colors.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: colors.accentBorder,
                      }}>
                      <Ionicons name="time" size={18} color={colors.accent} />
                    </View>
                    <Text style={{fontSize: 18, fontWeight: '800', color: colors.text}}>Geçmiş</Text>
                  </View>
                  <Pressable
                    testID="chat-history-close"
                    onPress={() => closeHistoryPanel()}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surface,
                    }}>
                    <Ionicons name="close" size={18} color={colors.text} />
                  </Pressable>
                </View>

                <View
                  style={{
                    minHeight: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.lineStrong,
                    backgroundColor: colors.surface,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    gap: 8,
                    marginBottom: 12,
                  }}>
                  <Ionicons name="search" size={16} color={colors.textMuted} />
                  <TextInput
                    value={historyQuery}
                    onChangeText={setHistoryQuery}
                    placeholder="Maç veya takım ara..."
                    placeholderTextColor={colors.placeholder}
                    style={{flex: 1, color: colors.text, fontSize: 13, paddingVertical: 10}}
                  />
                  {historyQuery ? (
                    <Pressable onPress={() => setHistoryQuery('')}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>

                <ScrollView contentContainerStyle={{gap: 8, paddingBottom: 12}} showsVerticalScrollIndicator={false}>
                  {searchLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                  {searchError ? <StatusBanner message={searchError} tone="error" /> : null}

                  {historyQuery.trim()
                    ? searchResults.map(item => {
                        const isSelected = Number(selectedFixture?.fixture_id) === Number(item.fixture_id) && !activeThreadId;
                        return (
                          <Pressable
                            key={`history-search-${item.fixture_id}`}
                            onPress={() => {
                              selectFixtureForNewChat(item).catch(() => undefined);
                              closeHistoryPanel();
                            }}
                            style={{
                              borderWidth: 1.5,
                              borderColor: isSelected ? colors.accentBorder : colors.line,
                              borderRadius: 12,
                              backgroundColor: isSelected ? colors.accentSoft : colors.card,
                              padding: 10,
                              gap: 8,
                              shadowColor: isSelected ? colors.accent : colors.shadow,
                              shadowOpacity: isSelected ? 0.15 : 0.05,
                              shadowRadius: 6,
                              shadowOffset: {width: 0, height: 2},
                              elevation: isSelected ? 3 : 1,
                            }}>
                            {isSelected ? (
                              <View style={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: colors.accent,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                                <Ionicons name="checkmark" size={14} color={colors.inverseText} />
                              </View>
                            ) : null}
                            <View style={{gap: 6}}>
                              <TeamLogoBadge name={String(item.home_team_name || '-')} logo={item.home_team_logo} size="sm" />
                              <TeamLogoBadge name={String(item.away_team_name || '-')} logo={item.away_team_logo} size="sm" />
                            </View>
                            <View style={{
                              backgroundColor: colors.surface,
                              borderRadius: 8,
                              padding: 6,
                            }}>
                              <Text style={{fontSize: 10, color: colors.textMuted}} numberOfLines={1}>
                                {item.league_name || 'Lig'}
                              </Text>
                              <Text style={{fontSize: 11, color: colors.text, fontWeight: '600'}}>
                                {formatKickoff(item.starting_at)}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })
                    : null}

                  {threadsLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
                  {threadsError ? <StatusBanner message={threadsError} tone="error" /> : null}

                  {!threadsLoading && !threads.length ? <Text style={{fontSize: 12, color: colors.textMuted}}>Henuz chat gecmisi yok.</Text> : null}

                  {threads.map(thread => {
                    const isSelected = Number(activeThreadId) === Number(thread.id);
                    return (
                      <Pressable
                        key={`history-thread-${thread.id}`}
                        onPress={() => {
                          selectThread(thread.id).catch(() => undefined);
                          closeHistoryPanel();
                        }}
                        style={{
                          borderWidth: 1.5,
                          borderColor: isSelected ? colors.accentBorder : colors.line,
                          borderRadius: 12,
                          backgroundColor: isSelected ? colors.accentSoft : colors.card,
                          padding: 10,
                          gap: 8,
                          shadowColor: isSelected ? colors.accent : colors.shadow,
                          shadowOpacity: isSelected ? 0.15 : 0.05,
                          shadowRadius: 6,
                          shadowOffset: {width: 0, height: 2},
                          elevation: isSelected ? 3 : 1,
                        }}>
                        {isSelected ? (
                          <View style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            backgroundColor: colors.accent,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <Ionicons name="checkmark" size={14} color={colors.inverseText} />
                          </View>
                        ) : null}
                        <View style={{gap: 6}}>
                          <TeamLogoBadge name={String(thread.home_team_name || '-')} logo={thread.home_team_logo} size="sm" />
                          <TeamLogoBadge name={String(thread.away_team_name || '-')} logo={thread.away_team_logo} size="sm" />
                        </View>
                        <Text style={{fontSize: 12, color: colors.text, lineHeight: 17}} numberOfLines={2}>
                          {compactChatText(thread.last_message_content || thread.match_label, 60)}
                        </Text>
                        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                          <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                          <Text style={{fontSize: 10, color: colors.textMuted}}>{formatStamp(thread.last_message_at)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </RNAnimated.View>
            </View>
          ) : null}

          {couponVisible ? (
            <View pointerEvents="box-none" style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 60}}>
              <Pressable
                testID="chat-coupon-backdrop"
                onPress={() => closeCouponPanel()}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: colors.overlayBackdrop,
                }}
              />

              <RNAnimated.View
                testID="chat-coupon-panel"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  right: 0,
                  width: couponPanelWidth,
                  borderLeftWidth: 1,
                  borderLeftColor: colors.lineStrong,
                  backgroundColor: colors.backgroundElevated,
                  paddingTop: 16,
                  paddingHorizontal: 12,
                  paddingBottom: 12,
                  transform: [{translateX: couponTranslateX}],
                }}>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: colors.warningSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: colors.warningBorder,
                      }}>
                      <Ionicons name="ticket" size={18} color={colors.warning} />
                    </View>
                    <View>
                      <Text style={{fontSize: 18, fontWeight: '800', color: colors.text}}>Kupon Sepeti</Text>
                      <Text style={{fontSize: 11, color: colors.textMuted}}>{couponEntries.length} maç</Text>
                    </View>
                  </View>
                  <Pressable
                    testID="chat-coupon-close"
                    onPress={() => closeCouponPanel()}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.surface,
                    }}>
                    <Ionicons name="close" size={18} color={colors.text} />
                  </Pressable>
                </View>

                <ScrollView contentContainerStyle={{gap: 10, paddingBottom: 12}} showsVerticalScrollIndicator={false}>
                  {!couponEntries.length ? (
                    <View
                      style={{
                        paddingVertical: 40,
                        alignItems: 'center',
                        gap: 12,
                      }}>
                      <Ionicons name="ticket-outline" size={48} color={colors.textMuted} style={{opacity: 0.5}} />
                      <Text style={{fontSize: 14, color: colors.textMuted, textAlign: 'center'}}>
                        Kuponda seçim yok
                      </Text>
                      <Text style={{fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 17}}>
                        Maç seçerek kupona ekle
                      </Text>
                    </View>
                  ) : null}

                  {couponEntries.map(entry => (
                    <View
                      key={`coupon-fixture-${entry.fixture_id}`}
                      style={{
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: colors.line,
                        backgroundColor: colors.card,
                        padding: 12,
                        gap: 10,
                        shadowColor: colors.shadow,
                        shadowOpacity: 0.08,
                        shadowRadius: 8,
                        shadowOffset: {width: 0, height: 2},
                        elevation: 2,
                      }}>
                      <View style={{gap: 6}}>
                        <TeamLogoBadge name={entry.home_team_name} logo={entry.home_team_logo} size="sm" />
                        <TeamLogoBadge name={entry.away_team_name} logo={entry.away_team_logo} size="sm" />
                      </View>

                      <View style={{
                        backgroundColor: colors.surface,
                        borderRadius: 8,
                        padding: 8,
                        gap: 4,
                      }}>
                        <Text style={{fontSize: 10, color: colors.textMuted}} numberOfLines={1}>
                          {entry.league_name || 'Lig'}
                        </Text>
                        <Text style={{fontSize: 11, color: colors.text, fontWeight: '600'}}>
                          {formatKickoff(entry.starting_at)}
                        </Text>
                      </View>

                      <View style={{gap: 6}}>
                        <Text style={{fontSize: 11, color: colors.textMuted, fontWeight: '600'}}>
                          Seçimler ({entry.selection_count})
                        </Text>
                        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
                          {entry.selections.slice(0, 3).map((selection, idx) => (
                            <View
                              key={`coupon-selection-${entry.fixture_id}-${idx}`}
                              style={{
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: colors.accentBorder,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                backgroundColor: colors.accentSoft,
                              }}>
                              <Text style={{fontSize: 11, color: colors.text, fontWeight: '600'}}>
                                {selection.selection_display || selection.selection}
                              </Text>
                              <Text style={{fontSize: 10, color: colors.textMuted}}>
                                {oddText(selection.odd)}
                              </Text>
                            </View>
                          ))}
                          {entry.selection_count > 3 ? (
                            <View
                              style={{
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: colors.lineStrong,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                backgroundColor: colors.surface,
                                justifyContent: 'center',
                              }}>
                              <Text style={{fontSize: 11, color: colors.textMuted, fontWeight: '600'}}>
                                +{entry.selection_count - 3}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <Pressable
                        onPress={() => {
                          handleAutoAskFromCoupon(entry).catch(() => undefined);
                        }}
                        disabled={sending || autoAskFixtureId === entry.fixture_id}
                        style={{
                          minHeight: 40,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: colors.accentBorder,
                          backgroundColor: colors.accentSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 12,
                          flexDirection: 'row',
                          gap: 8,
                          opacity: sending || autoAskFixtureId === entry.fixture_id ? 0.6 : 1,
                        }}>
                        {autoAskFixtureId === entry.fixture_id ? (
                          <ActivityIndicator size="small" color={colors.accent} />
                        ) : (
                          <Ionicons name="sparkles" size={16} color={colors.accent} />
                        )}
                        <Text style={{fontSize: 13, fontWeight: '700', color: colors.text}}>
                          {autoAskFixtureId === entry.fixture_id ? 'AI Analiz Ediyor...' : "AI'a Sor"}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </RNAnimated.View>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
