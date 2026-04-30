import type { RawRound } from "./analytics";
import { buildStableRoundId } from "./golfpadParser";

const STORAGE_KEY = "golfpad.analytics.rounds.v1";
const API_ROUNDS_PATH = "/api/rounds";

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
  status: PersistenceStatus;
};

function readLocalRoundDatabase(): RawRound[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredRoundDatabase;
    return Array.isArray(parsed.rounds) ? parsed.rounds : [];
  } catch {
    return [];
  }
}

function writeLocalRoundDatabase(rounds: RawRound[]) {
  const database: StoredRoundDatabase = {
    version: 1,
    updatedAt: new Date().toISOString(),
    rounds,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

export async function loadRoundDatabase(): Promise<LoadRoundDatabaseResult> {
  const localRounds = readLocalRoundDatabase();

  try {
    const response = await fetch(API_ROUNDS_PATH, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Database API returned ${response.status}`);
    const parsed = (await response.json()) as StoredRoundDatabase;
    const serverRounds = Array.isArray(parsed.rounds) ? parsed.rounds : [];

    if (localRounds.length) {
      const merged = mergeNewRounds(serverRounds, localRounds);
      if (merged.added > 0) {
        await saveRoundDatabase(merged.rounds);
      }
      return { rounds: merged.rounds, status: SERVER_STATUS };
    }

    writeLocalRoundDatabase(serverRounds);
    return { rounds: serverRounds, status: SERVER_STATUS };
  } catch (error) {
    console.warn("Persistent server database is unavailable; falling back to localStorage.", error);
    return { rounds: localRounds, status: LOCAL_ONLY_STATUS };
  }
}

export async function saveRoundDatabase(rounds: RawRound[]): Promise<PersistenceStatus> {
  writeLocalRoundDatabase(rounds);

  try {
    const response = await fetch(API_ROUNDS_PATH, {
      method: "PUT",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        rounds,
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

export async function clearRoundDatabase(): Promise<PersistenceStatus> {
  window.localStorage.removeItem(STORAGE_KEY);

  try {
    const response = await fetch(API_ROUNDS_PATH, { method: "DELETE", headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Database API returned ${response.status}`);
    return SERVER_STATUS;
  } catch (error) {
    console.warn("Could not clear persistent server database; localStorage was cleared.", error);
    return LOCAL_ONLY_STATUS;
  }
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
