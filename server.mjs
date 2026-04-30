import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 4173);
const ROOT = resolve(fileURLToPath(new URL("./dist", import.meta.url)));
const DATA_DIR = resolve(process.env.GOLFPAD_DATA_DIR ?? join(process.cwd(), "data"));
const DATABASE_FILE = join(DATA_DIR, "rounds.json");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function readRequestBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function normalizeDatabase(value) {
  return {
    version: 1,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    rounds: Array.isArray(value?.rounds) ? value.rounds : [],
    handicapHistory: Array.isArray(value?.handicapHistory) ? value.handicapHistory : [{ date: new Date().toISOString().slice(0, 10), hcp: 28.8 }],
  };
}

async function readDatabase() {
  await ensureDataDir();
  try {
    const raw = await readFile(DATABASE_FILE, "utf8");
    return normalizeDatabase(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return normalizeDatabase({ version: 1, updatedAt: new Date().toISOString(), rounds: [] });
    }

    const backup = `${DATABASE_FILE}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await copyFile(DATABASE_FILE, backup).catch(() => undefined);
    throw new Error(`Database file could not be read. A backup was written to ${backup}.`);
  }
}

async function writeDatabase(database) {
  await ensureDataDir();
  const normalized = normalizeDatabase({
    ...database,
    updatedAt: new Date().toISOString(),
  });
  const tempFile = `${DATABASE_FILE}.tmp-${process.pid}`;
  await writeFile(tempFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(tempFile, DATABASE_FILE);
  return normalized;
}

async function handleApi(req, res) {
  try {
    if (req.url === "/api/health" && req.method === "GET") {
      sendJson(res, 200, { ok: true, dataDir: DATA_DIR });
      return true;
    }

    if (req.url !== "/api/rounds") return false;

    if (req.method === "GET") {
      sendJson(res, 200, await readDatabase());
      return true;
    }

    if (req.method === "PUT") {
      const raw = await readRequestBody(req);
      const incoming = normalizeDatabase(JSON.parse(raw));
      sendJson(res, 200, await writeDatabase(incoming));
      return true;
    }

    if (req.method === "DELETE") {
      sendJson(res, 200, await writeDatabase({ version: 1, rounds: [] }));
      return true;
    }

    sendJson(res, 405, { error: "Method not allowed." });
    return true;
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
    return true;
  }
}

async function serveStatic(req, res) {
  const requestedPath = decodeURIComponent(new URL(req.url ?? "/", `http://localhost:${PORT}`).pathname);
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = resolve(ROOT, safePath === "/" ? "index.html" : `.${safePath}`);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(ROOT, "index.html");
  }

  try {
    await access(filePath);
    res.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  await serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GolfPad dashboard listening on http://0.0.0.0:${PORT}`);
  console.log(`Persistent database file: ${DATABASE_FILE}`);
});
