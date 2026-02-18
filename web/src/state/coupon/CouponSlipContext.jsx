import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AUTH_TOKEN_KEY, readAuthToken } from "../../lib/auth";
import {
  COUPON_SLIP_LEGACY_SNAPSHOT_KEY,
  COUPON_SLIP_STATE_KEY,
  COUPON_SLIP_UI_KEY,
  DEFAULT_COUPON_COUNT,
  DEFAULT_SLIP_OPEN,
  DEFAULT_STAKE,
  couponTotalOdds,
  createDefaultCouponSlipState,
  loadCouponSlipStateFromStorage,
  loadCouponSlipUiFromStorage,
  loadLegacyCouponSlipSnapshot,
  resolveSlipPickKey,
  sanitizeCouponCount,
  sanitizeSlipItem,
  sanitizeSlipItems,
  sanitizeStake,
} from "../../lib/couponSlip";

const CouponSlipContext = createContext(null);

function removePersistedSlipState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(COUPON_SLIP_STATE_KEY);
  window.localStorage.removeItem(COUPON_SLIP_UI_KEY);
  window.localStorage.removeItem(COUPON_SLIP_LEGACY_SNAPSHOT_KEY);
}

function loadInitialCouponSlipState() {
  const defaults = createDefaultCouponSlipState();
  if (typeof window === "undefined") return defaults;
  if (!readAuthToken()) return defaults;

  const persistedState = loadCouponSlipStateFromStorage();
  const persistedUi = loadCouponSlipUiFromStorage();

  if (persistedState) {
    return {
      ...defaults,
      ...persistedState,
      isOpen: typeof persistedUi?.isOpen === "boolean" ? persistedUi.isOpen : defaults.isOpen,
    };
  }

  const legacySnapshot = loadLegacyCouponSlipSnapshot();
  if (legacySnapshot) {
    window.localStorage.removeItem(COUPON_SLIP_LEGACY_SNAPSHOT_KEY);
    return {
      ...defaults,
      ...legacySnapshot,
      isOpen: typeof persistedUi?.isOpen === "boolean" ? persistedUi.isOpen : defaults.isOpen,
    };
  }

  return {
    ...defaults,
    isOpen: typeof persistedUi?.isOpen === "boolean" ? persistedUi.isOpen : defaults.isOpen,
  };
}

export function CouponSlipProvider({ children }) {
  const [slipState, setSlipState] = useState(() => loadInitialCouponSlipState());
  const slipStateRef = useRef(slipState);

  useEffect(() => {
    slipStateRef.current = slipState;
  }, [slipState]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncWithAuthState = () => {
      const token = readAuthToken();
      if (!token) {
        removePersistedSlipState();
        const defaultState = createDefaultCouponSlipState();
        slipStateRef.current = defaultState;
        setSlipState(defaultState);
        return;
      }

      const current = slipStateRef.current;
      const isDefaultState =
        current.items.length === 0 &&
        current.couponCount === DEFAULT_COUPON_COUNT &&
        current.stake === DEFAULT_STAKE &&
        current.isOpen === DEFAULT_SLIP_OPEN;
      if (!isDefaultState) return;

      const persistedState = loadCouponSlipStateFromStorage();
      const persistedUi = loadCouponSlipUiFromStorage();
      const fallbackLegacy = persistedState ? null : loadLegacyCouponSlipSnapshot();
      if (fallbackLegacy) {
        window.localStorage.removeItem(COUPON_SLIP_LEGACY_SNAPSHOT_KEY);
      }
      const nextState = persistedState || fallbackLegacy;
      if (!nextState && typeof persistedUi?.isOpen !== "boolean") return;

      const mergedState = {
        ...current,
        ...(nextState || {}),
        isOpen: typeof persistedUi?.isOpen === "boolean" ? persistedUi.isOpen : current.isOpen,
      };
      slipStateRef.current = mergedState;
      setSlipState(mergedState);
    };

    const onStorage = (event) => {
      if (
        !event.key ||
        event.key === AUTH_TOKEN_KEY ||
        event.key === COUPON_SLIP_STATE_KEY ||
        event.key === COUPON_SLIP_UI_KEY
      ) {
        syncWithAuthState();
      }
    };

    syncWithAuthState();
    window.addEventListener("auth-token-changed", syncWithAuthState);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("auth-token-changed", syncWithAuthState);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!readAuthToken()) return;

    try {
      window.localStorage.setItem(
        COUPON_SLIP_STATE_KEY,
        JSON.stringify({
          items: slipState.items,
          couponCount: slipState.couponCount,
          stake: slipState.stake,
        })
      );
    } catch (err) {
      // Ignore storage write errors.
    }
  }, [slipState.items, slipState.couponCount, slipState.stake]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!readAuthToken()) return;

    try {
      window.localStorage.setItem(
        COUPON_SLIP_UI_KEY,
        JSON.stringify({
          isOpen: slipState.isOpen,
        })
      );
    } catch (err) {
      // Ignore storage write errors.
    }
  }, [slipState.isOpen]);

  const addPick = useCallback((item) => {
    const normalized = sanitizeSlipItem(item);
    if (!normalized) return false;

    const key = resolveSlipPickKey(normalized);
    if (!key) return false;

    const currentState = slipStateRef.current;
    const exists = currentState.items.some((entry) => resolveSlipPickKey(entry) === key);
    if (exists) return false;

    const nextState = {
      ...currentState,
      items: [...currentState.items, normalized],
    };
    slipStateRef.current = nextState;
    setSlipState(nextState);
    return true;
  }, []);

  const addPicks = useCallback((items) => {
    const normalizedItems = sanitizeSlipItems(items);
    if (!normalizedItems.length) return 0;

    const currentState = slipStateRef.current;
    const currentKeys = new Set(currentState.items.map((item) => resolveSlipPickKey(item)).filter(Boolean));
    const toAdd = normalizedItems.filter((item) => {
      const key = resolveSlipPickKey(item);
      if (!key || currentKeys.has(key)) return false;
      currentKeys.add(key);
      return true;
    });

    if (!toAdd.length) return 0;

    const nextState = {
      ...currentState,
      items: [...currentState.items, ...toAdd],
    };
    slipStateRef.current = nextState;
    setSlipState(nextState);
    return toAdd.length;
  }, []);

  const removePick = useCallback((pickKeyOrItem) => {
    const resolvedKey =
      typeof pickKeyOrItem === "string" ? String(pickKeyOrItem || "").trim() : resolveSlipPickKey(pickKeyOrItem);
    if (!resolvedKey) return false;

    const currentState = slipStateRef.current;
    const nextItems = currentState.items.filter((item) => resolveSlipPickKey(item) !== resolvedKey);
    if (nextItems.length === currentState.items.length) return false;

    const nextState = {
      ...currentState,
      items: nextItems,
    };
    slipStateRef.current = nextState;
    setSlipState(nextState);
    return true;
  }, []);

  const clearSlip = useCallback(() => {
    const nextState = {
      ...slipStateRef.current,
      items: [],
    };
    slipStateRef.current = nextState;
    setSlipState(nextState);
  }, []);

  const setCouponCount = useCallback((value) => {
    const currentState = slipStateRef.current;
    const nextState = {
      ...currentState,
      couponCount: sanitizeCouponCount(value, currentState.couponCount),
    };
    slipStateRef.current = nextState;
    setSlipState(nextState);
  }, []);

  const setStake = useCallback((value) => {
    const currentState = slipStateRef.current;
    const nextState = {
      ...currentState,
      stake: sanitizeStake(value, currentState.stake),
    };
    slipStateRef.current = nextState;
    setSlipState(nextState);
  }, []);

  const open = useCallback(() => {
    const currentState = slipStateRef.current;
    const nextState = { ...currentState, isOpen: true };
    slipStateRef.current = nextState;
    setSlipState(nextState);
  }, []);

  const close = useCallback(() => {
    const currentState = slipStateRef.current;
    const nextState = { ...currentState, isOpen: false };
    slipStateRef.current = nextState;
    setSlipState(nextState);
  }, []);

  const toggle = useCallback(() => {
    const currentState = slipStateRef.current;
    const nextState = { ...currentState, isOpen: !currentState.isOpen };
    slipStateRef.current = nextState;
    setSlipState(nextState);
  }, []);

  const totalOdds = useMemo(() => couponTotalOdds(slipState.items), [slipState.items]);
  const couponAmount = useMemo(() => slipState.couponCount * slipState.stake, [slipState.couponCount, slipState.stake]);
  const maxWin = useMemo(() => couponAmount * totalOdds, [couponAmount, totalOdds]);

  const contextValue = useMemo(
    () => ({
      items: slipState.items,
      couponCount: slipState.couponCount,
      stake: slipState.stake,
      isOpen: slipState.isOpen,
      itemCount: slipState.items.length,
      totalOdds,
      couponAmount,
      maxWin,
      addPick,
      addPicks,
      removePick,
      clearSlip,
      setCouponCount,
      setStake,
      open,
      close,
      toggle,
    }),
    [
      slipState.items,
      slipState.couponCount,
      slipState.stake,
      slipState.isOpen,
      totalOdds,
      couponAmount,
      maxWin,
      addPick,
      addPicks,
      removePick,
      clearSlip,
      setCouponCount,
      setStake,
      open,
      close,
      toggle,
    ]
  );

  return <CouponSlipContext.Provider value={contextValue}>{children}</CouponSlipContext.Provider>;
}

export function useCouponSlip() {
  const value = useContext(CouponSlipContext);
  if (!value) {
    throw new Error("useCouponSlip must be used inside CouponSlipProvider");
  }
  return value;
}
