import JSZip from "jszip";
import Papa from "papaparse";
import type { ImportLog } from "./golfpadParser";
import type { HandicapEntry } from "./handicap";

export type MinGolfImportSummary = {
  fileType: "xlsx" | "csv" | "unknown";
  sheetNames: string[];
  selectedSheet: string | null;
  columnNames: string[];
  rowsFound: number;
  officialEntries: number;
  errors: string[];
  logs: ImportLog[];
};

export type ParsedMinGolfExport = {
  records: HandicapEntry[];
  summary: MinGolfImportSummary;
};

type Row = Record<string, string | number | null>;

const EXPECTED_SHEET = "Resultat";
const COLUMN = {
  number: "Nr.",
  date: "Speldatum",
  startTime: "Starttid",
  club: "Klubb",
  course: "Bana",
  holes: "Antal spelade h\u00e5l",
  par: "Par",
  tee: "Tee",
  courseRating: "CR",
  slope: "SL",
  adjustedGross: "Justerad bruttoscore",
  playingHandicap: "Spel-HCP",
  points: "Po\u00e4ng",
  pcc: "PCC",
  adjustedHandicapResult: "Justerat HCP-resultat",
  newExactHandicap: "Ny exakt hcp",
  included: "Rond ing\u00e5r i HCP-ber\u00e4kning",
  exceptionalScore: "Extraordin\u00e4r score (ack.)",
  manualAdjustment: "Manuell justering (ack.)",
} as const;

export async function parseMinGolfHandicapFile(file: File, onLog?: (log: ImportLog) => void): Promise<ParsedMinGolfExport> {
  const logs: ImportLog[] = [];
  const log = (level: ImportLog["level"], message: string) => {
    const entry = { level, message };
    logs.push(entry);
    onLog?.(entry);
  };

  log("info", `Reading ${file.name}`);
  const extension = file.name.split(".").pop()?.toLowerCase();
  const fileType = extension === "xlsx" ? "xlsx" : extension === "csv" ? "csv" : "unknown";
  const errors: string[] = [];
  let rows: Row[] = [];
  let sheetNames: string[] = [];
  let selectedSheet: string | null = null;

  if (fileType === "xlsx") {
    const parsed = await parseXlsx(file);
    rows = parsed.rows;
    sheetNames = parsed.sheetNames;
    selectedSheet = parsed.selectedSheet;
    log("info", `Workbook sheets: ${sheetNames.join(", ") || "none detected"}`);
  } else if (fileType === "csv") {
    rows = parseCsv(await file.text());
    selectedSheet = "CSV";
    log("info", "Detected CSV fallback export.");
  } else {
    errors.push("Unsupported Min Golf file type. Upload the .xlsx export from Min Golf.");
  }

  const columnNames = Object.keys(rows[0] ?? {});
  const missing = [COLUMN.date, COLUMN.newExactHandicap].filter((column) => !columnNames.includes(column));
  if (missing.length) errors.push(`Missing required Min Golf columns: ${missing.join(", ")}`);
  log("info", `${selectedSheet ?? "No sheet"}: ${rows.length} rows, ${columnNames.length} columns`);

  const importedAt = new Date().toISOString();
  const records = rows
    .map((row) => normalizeMinGolfRow(row, importedAt))
    .filter((record): record is HandicapEntry => Boolean(record))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!records.length && !errors.length) errors.push("No handicap rows with Speldatum and Ny exakt hcp were found.");
  log(records.length ? "info" : "warning", `Parsed ${records.length} official handicap entries`);

  return {
    records,
    summary: {
      fileType,
      sheetNames,
      selectedSheet,
      columnNames,
      rowsFound: rows.length,
      officialEntries: records.length,
      errors,
      logs,
    },
  };
}

function normalizeMinGolfRow(row: Row, importedAt: string): HandicapEntry | null {
  const date = normalizeDate(row[COLUMN.date]);
  const hcp = toNumber(row[COLUMN.newExactHandicap]);
  if (!date || hcp === null) return null;

  const club = text(row[COLUMN.club]);
  const courseName = text(row[COLUMN.course]);
  const adjustedGrossScore = toNumber(row[COLUMN.adjustedGross]);
  const rowNumber = toNumber(row[COLUMN.number]);

  return {
    date,
    hcp,
    source: "min-golf",
    recordId: `min-golf-${date}-${rowNumber ?? ""}-${slug(club)}-${slug(courseName)}-${adjustedGrossScore ?? ""}`,
    importedAt,
    startTime: text(row[COLUMN.startTime]),
    club,
    courseName,
    holesPlayed: toNumber(row[COLUMN.holes]),
    par: toNumber(row[COLUMN.par]),
    tee: text(row[COLUMN.tee]),
    courseRating: toNumber(row[COLUMN.courseRating]),
    slope: toNumber(row[COLUMN.slope]),
    adjustedGrossScore,
    playingHandicap: toNumber(row[COLUMN.playingHandicap]),
    points: toNumber(row[COLUMN.points]),
    pcc: toNumber(row[COLUMN.pcc]),
    adjustedHandicapResult: toNumber(row[COLUMN.adjustedHandicapResult]),
    includedInHandicapCalculation: toBool(row[COLUMN.included]),
  };
}

async function parseXlsx(file: File): Promise<{ rows: Row[]; sheetNames: string[]; selectedSheet: string | null }> {
  const zip = await JSZip.loadAsync(file);
  const strings = parseSharedStrings(await zip.file("xl/sharedStrings.xml")?.async("string"));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const sheetNames = parseSheetNames(workbookXml);
  const selectedIndex = Math.max(0, sheetNames.indexOf(EXPECTED_SHEET));
  const selectedSheet = sheetNames[selectedIndex] ?? null;
  const sheetPath = `xl/worksheets/sheet${selectedIndex + 1}.xml`;
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) return { rows: [], sheetNames, selectedSheet };

  return {
    rows: parseWorksheet(sheetXml, strings),
    sheetNames,
    selectedSheet,
  };
}

function parseSharedStrings(xml?: string) {
  if (!xml) return [];
  const doc = parseXml(xml);
  return elementsByLocalName(doc, "si").map((item) =>
    elementsByLocalName(item, "t")
      .map((node) => node.textContent ?? "")
      .join(""),
  );
}

function parseSheetNames(xml?: string) {
  if (!xml) return [];
  const doc = parseXml(xml);
  return elementsByLocalName(doc, "sheet").map((sheet) => sheet.getAttribute("name") ?? "").filter(Boolean);
}

function parseWorksheet(xml: string, sharedStrings: string[]): Row[] {
  const doc = parseXml(xml);
  const rowNodes = elementsByLocalName(doc, "row");
  const matrix = rowNodes.map((rowNode) => {
    const values: Array<string | number | null> = [];
    elementsByLocalName(rowNode, "c").forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "";
      const index = columnIndex(ref);
      values[index] = cellValue(cell, sharedStrings);
    });
    return values;
  });

  const headers = (matrix[0] ?? []).map((value) => String(value ?? "").trim());
  return matrix
    .slice(1)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? null]).filter(([header]) => header)),
    )
    .filter((row) => Object.values(row).some((value) => value !== null && value !== ""));
}

function cellValue(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return elementsByLocalName(cell, "t")[0]?.textContent ?? "";
  const raw = elementsByLocalName(cell, "v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : raw;
}

function parseCsv(content: string): Row[] {
  const parsed = Papa.parse<Row>(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (header) => header.replace(/^\uFEFF/, ""),
  });
  return parsed.data;
}

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = elementsByLocalName(doc, "parsererror")[0];
  if (parserError) throw new Error(parserError.textContent ?? "Could not parse XML.");
  return doc;
}

function elementsByLocalName(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((element) => element.localName === localName);
}

function columnIndex(ref: string) {
  const letters = ref.match(/[A-Z]+/)?.[0] ?? "A";
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeDate(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const sv = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (sv) return `${sv[1]}-${sv[2].padStart(2, "0")}-${sv[3].padStart(2, "0")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + value);
    return epoch.toISOString().slice(0, 10);
  }
  return null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function toBool(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["ja", "yes", "true", "1", "x"].includes(normalized)) return true;
  if (["nej", "no", "false", "0", ""].includes(normalized)) return false;
  return null;
}

function slug(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
