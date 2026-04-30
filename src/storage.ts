import type { RawRound } from "./analytics";
import { buildStableRoundId } from "./golfpadParser";

const STORAGE_KEY = "golfpad.analytics.rounds.v1";

export type StoredRoundDatabase = {
  version: 1;
  updatedAt: string;
  rounds: RawRound[];
};

export type ImportMergeResult = {
  rounds: RawRound[];
  added: number;
  duplicates: number;
};

export function loadRoundDatabase(): RawRound[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredRoundDatabase;
    return Array.isArray(parsed.rounds) ? parsed.rounds : [];
  } catch {
    return [];
  }
}

export function saveRoundDatabase(rounds: RawRound[]) {
  const database: StoredRoundDatabase = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rounds,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export function mergeNewRounds(existing: RawRound[], incoming: RawRound[]): ImportMergeResult {
  const ids = new Set(existing.map((round) => round.round_metadata?.round_id ?? buildStableRoundId(round)));
  const next = [...existing];
  let duplicates = 0;

  incoming.forEach((round) => {
    const id = round.round_metadata?.round_id ?? buildStableRoundId(round);
    if (ids.has(id)) {
      duplicates += 1;
      return;
    }
    ids.add(id);
    next.push({
      ...round,
      round_metadata: {
        ...round.round_metadata,
        round_id: id,
      },
    });
  });

  return { rounds: next, added: next.length - existing.length, duplicates };
}

export function clearRoundDatabase() {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function downloadRoundDatabase(rounds: RawRound[]) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          rounds,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `golfpad-local-rounds-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
