import React from "react";
import { AlertTriangle, CheckCircle2, FileArchive, Loader2, Upload } from "lucide-react";
import { parseGolfPadZip, type ImportLog, type ImportSummary } from "../golfpadParser";

export type ImportResult = {
  summary: ImportSummary;
  added: number;
  duplicates: number;
};

type ZipImportPanelProps = {
  onImport: (file: File, logs: (log: ImportLog) => void) => Promise<ImportResult>;
};

export function ZipImportPanel({ onImport }: ZipImportPanelProps) {
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [logs, setLogs] = React.useState<ImportLog[]>([]);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [lastFileName, setLastFileName] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file?: File) => {
    if (!file || busy) return;
    setLastFileName(file.name);
    setBusy(true);
    setResult(null);
    setLogs([]);
    try {
      const nextResult = await onImport(file, (log) => setLogs((current) => [...current, log]));
      setResult(nextResult);
      setLogs((current) => [
        ...current,
        { level: "info", message: "ZIP file reference cleared from the browser after parsing." },
      ]);
    } catch (error) {
      setLogs((current) => [
        ...current,
        { level: "error", message: error instanceof Error ? error.message : "Import failed." },
      ]);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  };

  return (
    <section className="import-panel panel">
      <div className="import-header">
        <div>
          <h2>Import Golf Pad ZIP</h2>
          <p>Drop the official Golf Pad export ZIP. The file is parsed locally and cleared from the browser after import.</p>
        </div>
        {busy ? <Loader2 className="spin" size={22} /> : <FileArchive size={22} />}
      </div>

      <button
        className={`drop-zone ${dragging ? "dragging" : ""}`}
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFile(event.dataTransfer.files[0]);
        }}
      >
        <Upload size={22} />
        <span>{busy ? "Parsing ZIP..." : "Choose ZIP or drag it here"}</span>
        <small>{lastFileName ? `Last parsed: ${lastFileName}` : "Rounds.csv, Holes.csv, and Shots.csv are detected inside the archive."}</small>
      </button>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {result && (
        <div className="import-summary">
          <SummaryItem label="Rounds found" value={result.summary.roundsFound} />
          <SummaryItem label="New added" value={result.added} tone="good" />
          <SummaryItem label="Duplicates skipped" value={result.duplicates} />
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

export async function parseZipForImport(file: File, onLog: (log: ImportLog) => void) {
  return parseGolfPadZip(file, onLog);
}

function SummaryItem({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <span className={tone}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
