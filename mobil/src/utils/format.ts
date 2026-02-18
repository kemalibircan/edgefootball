export function asPercent(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return '-';
  }
  return `%${(n * 100).toFixed(1)}`;
}

export function oddText(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) {
    return '-';
  }
  return n.toFixed(2);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    return value;
  }
  return dt.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
