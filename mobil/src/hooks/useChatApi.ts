import {useMemo, useRef} from 'react';
import {createChatMessage, getChatThreadMessages, getChatThreads, searchChatFixtures} from '../lib/api/endpoints';
import {createCouponPrefixFallback} from '../lib/chat/prefixFallback';

export function useChatApi() {
  const fallbackRef = useRef(createCouponPrefixFallback());

  const fallback = fallbackRef.current;

  return useMemo(
    () => ({
      currentPrefix: fallback.getPrefix,
      getChatThreads: (limit = 50) => fallback.withFallback(prefix => getChatThreads(prefix, limit)),
      getChatThreadMessages: (threadId: number, options?: {limit?: number; beforeId?: number | null}) =>
        fallback.withFallback(prefix => getChatThreadMessages(prefix, threadId, options)),
      searchChatFixtures: (q: string, limit = 20) => fallback.withFallback(prefix => searchChatFixtures(prefix, q, limit)),
      createChatMessage: (payload: Parameters<typeof createChatMessage>[1]) =>
        fallback.withFallback(prefix => createChatMessage(prefix, payload)),
    }),
    [fallback],
  );
}
