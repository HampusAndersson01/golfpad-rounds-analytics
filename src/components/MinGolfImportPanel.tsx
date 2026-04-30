import React from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { parseMinGolfHandicapFile, type MinGolfImportSummary } from "../minGolfParser";
import type { ImportLog } from "../golfpadParser";

export type MinGolfImportResult = {
  summary: MinGolfImportSummary;
  imported: number;
  matchedRounds: number;
};

type MinGolfImportPanelProps = {
  disabled: boolean;
  disabledMessage: string;
  onImport: (file: File, logs: (log: ImportLog) => void) => Promise<MinGolfImportResult>;
};

export function MinGolfImportPanel({ disabled, disabledMessage, onImport }: MinGolfImportPanelProps) {
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [logs, setLogs] = React.useState<ImportLog[]>([]);
  const [result, setResult] = React.useState<MinGolfImportResult | null>(null);
  const [lastFileName, setLastFileName] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file?: File) => {
    if (!file || busy || disabled) return;
    setLastFileName(file.name);
    setBusy(true);
    setResult(null);
    setLogs([]);
    try {
      const nextResult = await onImport(file, (log) => setLogs((current) => [...current, log]));
      setResult(nextResult);
      setLogs((current) => [...current, { level: "info", message: "Min Golf file reference cleared from the browser after parsing." }]);
    } catch (error) {
      setLogs((current) => [...current, { level: "error", message: error instanceof Error ? error.message : "Import failed." }]);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  };

  return (
    <section className="import-panel panel">
      <div className="import-header">
        <div>
          <h2>Import Min Golf Handicap History</h2>
          <p>Upload the official Min Golf handicap and round history export after Golf Pad rounds are stored.</p>
        </div>
        {busy ? <Loader2 className="spin" size={22} /> : <FileSpreadsheet size={22} />}
      </div>

      <button
        className={`drop-zone ${dragging ? "dragging" : ""}`}
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files[0]);
        }}
      >
        <Upload size={22} />
        <span>{disabled ? "Golf Pad import required" : busy ? "Parsing handicap file..." : "Choose XLSX or drag it here"}</span>
        <small>{disabled ? disabledMessage : lastFileName ? `Last parsed: ${lastFileName}` : "Reads the Resultat sheet from Min Golf."}</small>
      </button>
      <input ref={inputRef} hidden type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(event) => void handleFile(event.target.files?.[0])} />

      {result && (
        <div className="import-summary">
          <SummaryItem label="Official entries" value={result.imported} tone="good" />
          <SummaryItem label="Rows found" value={result.summary.rowsFound} />
          <SummaryItem label="Rounds matched" value={result.matchedRounds} tone={result.matchedRounds ? "good" : ""} />
          <SummaryItem label="Parse errors" value={result.summary.errors.length} tone={result.summary.errors.length ? "bad" : "good"} />
        </div>
      )}

      <div className="log-list" aria-live="polite">
        {logs.map((log, index) => (
          <div className={`log-row ${log.level}`} key={`${log.message}-${index}`}>
            {log.level === "error" ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            <span>{log.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export async function parseMinGolfForImport(file: File, onLog: (log: ImportLog) => void) {
  return parseMinGolfHandicapFile(file, onLog);
}

function SummaryItem({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <span className={tone}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
