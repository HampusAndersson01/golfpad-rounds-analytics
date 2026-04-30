import type { RawRound } from "./analytics";
import { buildStableRoundId } from "./golfpadParser";
import { DEFAULT_HANDICAP, normalizeHandicapHistory, type HandicapEntry } from "./handicap";

const STORAGE_KEY = "golfpad.analytics.rounds.v1";
const API_ROUNDS_PATH = "/api/rounds";

export type StoredRoundDatabase = {
  version: 1;
  updatedAt: string;
  rounds: RawRound[];
  handicapHistory?: HandicapEntry[];
};

export type ImportMergeResult = {
  rounds: RawRound[];
  added: number;
  duplicates: number;
};

export type PersistenceStatus = {
  source: "server" | "localStorage";
  persistedToServer: boolean;
  message: string;
};

const LOCAL_ONLY_STATUS: PersistenceStatus = {
  source: "localStorage",
  persistedToServer: false,
  message: "Using browser localStorage fallback.",
};

const SERVER_STATUS: PersistenceStatus = {
  source: "server",
  persistedToServer: true,
  message: "Stored in the Docker data volume.",
};

export type LoadRoundDatabaseResult = {
  rounds: RawRound[];
  handicapHistory: HandicapEntry[];
  status: PersistenceStatus;
};

type LocalRoundDatabase = {
  rounds: RawRound[];
  handicapHistory: HandicapEntry[];
};

function readLocalRoundDatabase(): LocalRoundDatabase {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rounds: [], handicapHistory: [{ date: new Date().toISOString().slice(0, 10), hcp: DEFAULT_HANDICAP }] };
    const parsed = JSON.parse(raw) as StoredRoundDatabase;
    return {
      rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
      handicapHistory: normalizeHandicapHistory(parsed.handicapHistory),
    };
  } catch {
    return { rounds: [], handicapHistory: [{ date: new Date().toISOString().slice(0, 10), hcp: DEFAULT_HANDICAP }] };
  }
}

function writeLocalRoundDatabase(rounds: RawRound[], handicapHistory: HandicapEntry[]) {
  const database: StoredRoundDatabase = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rounds,
    handicapHistory: normalizeHandicapHistory(handicapHistory),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export async function loadRoundDatabase(): Promise<LoadRoundDatabaseResult> {
  const localDatabase = readLocalRoundDatabase();

  try {
    const response = await fetch(API_ROUNDS_PATH, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Database API returned ${response.status}`);
    const parsed = (await response.json()) as StoredRoundDatabase;
    const serverRounds = Array.isArray(parsed.rounds) ? parsed.rounds : [];
    const serverHandicapHistory = normalizeHandicapHistory(parsed.handicapHistory);
    const handicapHistory = localDatabase.handicapHistory.length > serverHandicapHistory.length ? localDatabase.handicapHistory : serverHandicapHistory;

    if (localDatabase.rounds.length) {
      const merged = mergeNewRounds(serverRounds, localDatabase.rounds);
      if (merged.added > 0) {
        await saveRoundDatabase(merged.rounds, handicapHistory);
      }
      return { rounds: merged.rounds, handicapHistory, status: SERVER_STATUS };
    }

    writeLocalRoundDatabase(serverRounds, handicapHistory);
    return { rounds: serverRounds, handicapHistory, status: SERVER_STATUS };
  } catch (error) {
    console.warn("Persistent server database is unavailable; falling back to localStorage.", error);
    return { rounds: localDatabase.rounds, handicapHistory: localDatabase.handicapHistory, status: LOCAL_ONLY_STATUS };
  }
}

export async function saveRoundDatabase(rounds: RawRound[], handicapHistory: HandicapEntry[]): Promise<PersistenceStatus> {
  const normalizedHandicapHistory = normalizeHandicapHistory(handicapHistory);
  writeLocalRoundDatabase(rounds, normalizedHandicapHistory);

  try {
    const response = await fetch(API_ROUNDS_PATH, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        rounds,
        handicapHistory: normalizedHandicapHistory,
      }),
    });
    if (!response.ok) throw new Error(`Database API returned ${response.status}`);
    return SERVER_STATUS;
  } catch (error) {
    console.warn("Could not save to persistent server database; localStorage was updated.", error);
    return LOCAL_ONLY_STATUS;
  }
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

export async function clearRoundDatabase(handicapHistory: HandicapEntry[]): Promise<PersistenceStatus> {
  writeLocalRoundDatabase([], handicapHistory);

  try {
    const response = await fetch(API_ROUNDS_PATH, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        rounds: [],
        handicapHistory: normalizeHandicapHistory(handicapHistory),
      }),
    });
    if (!response.ok) throw new Error(`Database API returned ${response.status}`);
    return SERVER_STATUS;
  } catch (error) {
    console.warn("Could not clear persistent server database; localStorage was cleared.", error);
    return LOCAL_ONLY_STATUS;
  }
}

export function downloadRoundDatabase(rounds: RawRound[], handicapHistory: HandicapEntry[]) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          rounds,
          handicapHistory: normalizeHandicapHistory(handicapHistory),
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
