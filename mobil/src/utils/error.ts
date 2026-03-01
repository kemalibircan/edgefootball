export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function normalizeKnownApiMessage(message: string) {
  const text = String(message || '').trim();
  if (!text) {
    return text;
  }

  const missingLeagueModel =
    /No ready\/default model found for league\s+(\d+)/i.exec(text) ||
    /No trained models available for requested league/i.exec(text);

  if (missingLeagueModel) {
    const leagueId = missingLeagueModel[1] ? Number(missingLeagueModel[1]) : null;
    if (Number.isFinite(leagueId)) {
      return `Bu lig icin henuz hazir bir AI modeli yok (Lig: ${leagueId}). Lutfan daha sonra tekrar deneyin.`;
    }
    return 'Bu macin ligi icin henuz hazir bir AI modeli yok. Lutfan daha sonra tekrar deneyin.';
  }

  return text;
}

export function messageFromUnknown(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return normalizeKnownApiMessage(error.message);
  }
  return fallback;
}
