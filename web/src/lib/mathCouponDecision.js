const STRATEGY_PROFILES = {
  single_low_mid: {
    edge_ref: 0.1,
    ev_ref: 5.0,
    play_threshold: 60,
  },
  double_system: {
    edge_ref: 0.22,
    ev_ref: 10.0,
    play_threshold: 62,
  },
  mix_single: {
    edge_ref: 0.08,
    ev_ref: 4.0,
    play_threshold: 58,
  },
  mix_double: {
    edge_ref: 0.2,
    ev_ref: 8.0,
    play_threshold: 60,
  },
  mix_shot: {
    edge_ref: 0.3,
    ev_ref: 12.0,
    play_threshold: 72,
  },
};

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function resolveCouponVariant(couponId, strategyKey) {
  const strategy = String(strategyKey || "").trim();
  if (strategy && strategy !== "mix_portfolio") {
    return strategy;
  }
  const normalizedId = String(couponId || "").trim().toLowerCase();
  if (normalizedId.startsWith("mix-shot-")) return "mix_shot";
  if (normalizedId.startsWith("mix-double-")) return "mix_double";
  if (normalizedId.startsWith("mix-single-")) return "mix_single";
  if (normalizedId.startsWith("double-")) return "double_system";
  return "single_low_mid";
}

export function computeOddsFitScore(totalOdds, targetRange) {
  const safeOdds = safeNumber(totalOdds, 0);
  const min = safeNumber(targetRange?.min, 0);
  const max = safeNumber(targetRange?.max, 0);
  if (safeOdds <= 0 || min <= 0 || max <= 0 || max < min) return 0;
  if (safeOdds >= min && safeOdds <= max) return 15;
  const toleranceMin = min * 0.75;
  const toleranceMax = max * 1.35;
  if (safeOdds >= toleranceMin && safeOdds <= toleranceMax) return 7;
  return 0;
}

export function computeCouponDecision(item, context = {}) {
  const variant = resolveCouponVariant(item?.coupon_id, item?.coupon_variant || context.strategyKey);
  const profile = STRATEGY_PROFILES[variant] || STRATEGY_PROFILES.single_low_mid;
  const targetRange =
    (context.targetRangeByVariant && context.targetRangeByVariant[variant]) || context.targetRange || null;

  const edgeSum = safeNumber(item?.edge_sum, 0);
  const evScore = safeNumber(item?.expected_value_score, 0);
  const totalOdds = safeNumber(item?.total_odds, 0);

  const edgeScore = clamp(edgeSum / Math.max(0.0001, profile.edge_ref), 0, 1) * 55;
  const expectedValueScore = clamp(evScore / Math.max(0.0001, profile.ev_ref), 0, 1) * 30;
  const oddsFit = computeOddsFitScore(totalOdds, targetRange);
  const riskAdjust = variant === "mix_shot" ? -10 : 0;

  const score = clamp(Math.round(edgeScore + expectedValueScore + oddsFit + riskAdjust), 0, 100);
  const decision = score >= profile.play_threshold ? "play" : "skip";

  const edgeLevel = edgeSum >= profile.edge_ref ? "guclu" : edgeSum >= profile.edge_ref * 0.55 ? "orta" : "zayif";
  const oddsReason = oddsFit === 15 ? "hedef aralikta" : oddsFit === 7 ? "hedef disinda (esnek mod)" : "hedef disinda";
  const reasons = [
    `Edge seviyesi: ${edgeLevel}.`,
    `Oran durumu: ${oddsReason}.`,
  ];
  if (variant === "mix_shot") {
    reasons.push("Shot sepeti yuksek varyans tasir.");
  }

  return {
    decision,
    score,
    reasons,
    variant,
    threshold: profile.play_threshold,
  };
}

export function groupCouponsByDecision(items = [], context = {}) {
  const normalized = Array.isArray(items) ? items : [];
  const withDecision = normalized.map((item) => {
    const decisionInfo = computeCouponDecision(item, context);
    return {
      ...item,
      ...decisionInfo,
    };
  });

  withDecision.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const rightEdge = safeNumber(right?.edge_sum, 0);
    const leftEdge = safeNumber(left?.edge_sum, 0);
    if (rightEdge !== leftEdge) return rightEdge - leftEdge;
    return String(left?.coupon_id || "").localeCompare(String(right?.coupon_id || ""));
  });

  return {
    play: withDecision.filter((item) => item.decision === "play"),
    skip: withDecision.filter((item) => item.decision === "skip"),
  };
}
