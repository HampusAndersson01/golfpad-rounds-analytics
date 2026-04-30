import type { ManualStrokeIndexConfig, RawRound } from "./analytics";
import { buildStableRoundId } from "./golfpadParser";
import { DEFAULT_HANDICAP, normalizeHandicapHistory, type HandicapEntry } from "./handicap";

const STORAGE_KEY = "golfpad.analytics.rounds.v1";
const API_ROUNDS_PATH = "/api/rounds";

export type StoredRoundDatabase = {
  version: 2;
  updatedAt: string;
  rounds: RawRound[];
  handicapHistory?: HandicapEntry[];
  strokeIndexConfigs?: ManualStrokeIndexConfig[];
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
  strokeIndexConfigs: ManualStrokeIndexConfig[];
  status: PersistenceStatus;
};

type LocalRoundDatabase = {
  rounds: RawRound[];
  handicapHistory: HandicapEntry[];
  strokeIndexConfigs: ManualStrokeIndexConfig[];
};

function readLocalRoundDatabase(): LocalRoundDatabase {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { rounds: [], handicapHistory: [{ date: new Date().toISOString().slice(0, 10), hcp: DEFAULT_HANDICAP }], strokeIndexConfigs: [] };
    const parsed = JSON.parse(raw) as StoredRoundDatabase;
    return {
      rounds: Array.isArray(parsed.rounds) ? parsed.rounds : [],
      handicapHistory: normalizeHandicapHistory(parsed.handicapHistory),
      strokeIndexConfigs: Array.isArray(parsed.strokeIndexConfigs) ? parsed.strokeIndexConfigs : [],
    };
  } catch {
    return { rounds: [], handicapHistory: [{ date: new Date().toISOString().slice(0, 10), hcp: DEFAULT_HANDICAP }], strokeIndexConfigs: [] };
  }
}

function writeLocalRoundDatabase(rounds: RawRound[], handicapHistory: HandicapEntry[], strokeIndexConfigs: ManualStrokeIndexConfig[]) {
  const database: StoredRoundDatabase = {
    version: 2,
    updatedAt: new Date().toISOString(),
    rounds,
    handicapHistory: normalizeHandicapHistory(handicapHistory),
    strokeIndexConfigs,
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
    const serverStrokeIndexConfigs = Array.isArray(parsed.strokeIndexConfigs) ? parsed.strokeIndexConfigs : [];
    const handicapHistory = localDatabase.handicapHistory.length > serverHandicapHistory.length ? localDatabase.handicapHistory : serverHandicapHistory;
    const strokeIndexConfigs = mergeStrokeIndexConfigs(serverStrokeIndexConfigs, localDatabase.strokeIndexConfigs);

    if (localDatabase.rounds.length) {
      const merged = mergeNewRounds(serverRounds, localDatabase.rounds);
      if (merged.added > 0) {
        await saveRoundDatabase(merged.rounds, handicapHistory, strokeIndexConfigs);
      }
      return { rounds: merged.rounds, handicapHistory, strokeIndexConfigs, status: SERVER_STATUS };
    }

    writeLocalRoundDatabase(serverRounds, handicapHistory, strokeIndexConfigs);
    return { rounds: serverRounds, handicapHistory, strokeIndexConfigs, status: SERVER_STATUS };
  } catch (error) {
    console.warn("Persistent server database is unavailable; falling back to localStorage.", error);
    return { rounds: localDatabase.rounds, handicapHistory: localDatabase.handicapHistory, strokeIndexConfigs: localDatabase.strokeIndexConfigs, status: LOCAL_ONLY_STATUS };
  }
}

export async function saveRoundDatabase(rounds: RawRound[], handicapHistory: HandicapEntry[], strokeIndexConfigs: ManualStrokeIndexConfig[] = []): Promise<PersistenceStatus> {
  const normalizedHandicapHistory = normalizeHandicapHistory(handicapHistory);
  writeLocalRoundDatabase(rounds, normalizedHandicapHistory, strokeIndexConfigs);

  try {
    const response = await fetch(API_ROUNDS_PATH, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        version: 2,
        updatedAt: new Date().toISOString(),
        rounds,
        handicapHistory: normalizedHandicapHistory,
        strokeIndexConfigs,
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

export async function clearRoundDatabase(handicapHistory: HandicapEntry[], strokeIndexConfigs: ManualStrokeIndexConfig[] = []): Promise<PersistenceStatus> {
  writeLocalRoundDatabase([], handicapHistory, strokeIndexConfigs);

  try {
    const response = await fetch(API_ROUNDS_PATH, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        version: 2,
        updatedAt: new Date().toISOString(),
        rounds: [],
        handicapHistory: normalizeHandicapHistory(handicapHistory),
        strokeIndexConfigs,
      }),
    });
    if (!response.ok) throw new Error(`Database API returned ${response.status}`);
    return SERVER_STATUS;
  } catch (error) {
    console.warn("Could not clear persistent server database; localStorage was cleared.", error);
    return LOCAL_ONLY_STATUS;
  }
}

export function downloadRoundDatabase(rounds: RawRound[], handicapHistory: HandicapEntry[], strokeIndexConfigs: ManualStrokeIndexConfig[] = []) {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 2,
          exportedAt: new Date().toISOString(),
          rounds,
          handicapHistory: normalizeHandicapHistory(handicapHistory),
          strokeIndexConfigs,
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

function mergeStrokeIndexConfigs(serverConfigs: ManualStrokeIndexConfig[], localConfigs: ManualStrokeIndexConfig[]) {
  const byKey = new Map<string, ManualStrokeIndexConfig>();
  [...serverConfigs, ...localConfigs].forEach((config) => {
    const key = `${config.courseName.toLowerCase()}__${config.teeName.toLowerCase()}`;
    byKey.set(key, config);
  });
  return Array.from(byKey.values());
}
