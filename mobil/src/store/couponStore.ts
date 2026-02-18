import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {CouponMatch, SavedCouponItem} from '../types/api';
import {STORAGE_KEYS} from '../lib/storage/keys';

type SlipItem = SavedCouponItem & {
  pick_key: string;
};

type CouponState = {
  items: SlipItem[];
  couponCount: number;
  stake: number;
  addPick: (item: CouponMatch) => void;
  addPicks: (items: CouponMatch[]) => number;
  removePick: (pickKey: string) => void;
  clearSlip: () => void;
  setCouponCount: (value: number) => void;
  setStake: (value: number) => void;
};

function normalizeLine(value: string | null | undefined) {
  return String(value || '').trim();
}

function inferMarketKey(selection: string) {
  const s = String(selection || '').toUpperCase().trim();
  if (['1', '0', '2'].includes(s)) {
    return 'match_result';
  }
  if (s.startsWith('IY-')) {
    return 'first_half';
  }
  if (s.startsWith('HCP(')) {
    return 'handicap';
  }
  if (s.startsWith('ALT-') || s.startsWith('UST-')) {
    return 'over_under_25';
  }
  if (s.startsWith('KG-')) {
    return 'btts';
  }
  return 'match_result';
}

function buildPickKey(item: Partial<SavedCouponItem>) {
  const fixtureId = Number(item.fixture_id);
  const selection = String(item.selection || '').trim();
  if (!Number.isFinite(fixtureId) || !selection) {
    return '';
  }
  const marketKey = String(item.market_key || inferMarketKey(selection)).trim();
  return `${Math.trunc(fixtureId)}:${marketKey}:${normalizeLine(item.line) || '-'}:${selection}`;
}

function toSlipItem(item: CouponMatch): SlipItem | null {
  const pickKey = buildPickKey(item);
  if (!pickKey) {
    return null;
  }
  return {
    fixture_id: Number(item.fixture_id),
    home_team_name: String(item.home_team_name || '-'),
    away_team_name: String(item.away_team_name || '-'),
    home_team_logo: item.home_team_logo || null,
    away_team_logo: item.away_team_logo || null,
    starting_at: item.starting_at || null,
    selection: String(item.selection || ''),
    odd: Number(item.odd),
    league_id: item.league_id ?? null,
    league_name: item.league_name ?? null,
    market_key: item.market_key || inferMarketKey(String(item.selection || '')),
    market_label: item.market_label ?? null,
    line: item.line ?? null,
    selection_display: item.selection_display || item.selection,
    pick_key: pickKey,
  };
}

export function calculateTotalOdds(items: SlipItem[]) {
  return items.reduce((acc, item) => {
    const odd = Number(item.odd);
    if (!Number.isFinite(odd) || odd <= 1) {
      return acc;
    }
    return acc * odd;
  }, 1);
}

export const useCouponStore = create<CouponState>()(
  persist(
    (set, get) => ({
      items: [],
      couponCount: 1,
      stake: 50,
      addPick(item) {
        const normalized = toSlipItem(item);
        if (!normalized) {
          return;
        }
        if (get().items.some(x => x.pick_key === normalized.pick_key)) {
          return;
        }
        set({items: [...get().items, normalized]});
      },
      addPicks(items) {
        const existing = new Set(get().items.map(x => x.pick_key));
        const merged: SlipItem[] = [...get().items];
        let added = 0;
        for (const item of items) {
          const normalized = toSlipItem(item);
          if (!normalized || existing.has(normalized.pick_key)) {
            continue;
          }
          existing.add(normalized.pick_key);
          merged.push(normalized);
          added += 1;
        }
        if (added > 0) {
          set({items: merged});
        }
        return added;
      },
      removePick(pickKey) {
        set({items: get().items.filter(item => item.pick_key !== pickKey)});
      },
      clearSlip() {
        set({items: []});
      },
      setCouponCount(value) {
        const safe = Math.max(1, Math.trunc(Number(value) || 1));
        set({couponCount: safe});
      },
      setStake(value) {
        const safe = Math.max(1, Math.round(Number(value) || 1));
        set({stake: safe});
      },
    }),
    {
      name: STORAGE_KEYS.couponSlip,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        items: state.items,
        couponCount: state.couponCount,
        stake: state.stake,
      }),
    },
  ),
);
