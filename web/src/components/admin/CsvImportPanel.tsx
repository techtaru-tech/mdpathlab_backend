import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { ActionButton } from "@/components/ui-kit/ActionButton";
import { AdminApiError, type CsvImportResult, type CsvPreview } from "@/lib/admin-api";

type Props = {
  onDownloadTemplate: () => Promise<void>;
  onDownloadExport: () => Promise<void>;
  onPreview: (file: File) => Promise<CsvPreview>;
  onImport: (file: File) => Promise<CsvImportResult>;
  onImported: () => void;
};

// Shared by the Parameters and Tests admin pages — both need the identical
// download-template / upload / preview / row-level-errors / confirm-import flow.
export function CsvImportPanel({ onDownloadTemplate, onDownloadExport, onPreview, onImport, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleFileChange(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError("");
    if (!f) return;
    setBusy(true);
    try {
      const p = await onPreview(f);
      setPreview(p);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Couldn't read this CSV");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await onImport(file);
      setResult(r);
      onImported();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setOpen((v) => !v)} className="text-sm font-bold text-primary hover:underline">
          {open ? "Hide CSV import" : "Bulk import via CSV"}
        </button>
        <div className="flex gap-2">
          <button onClick={onDownloadTemplate} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary">
            <Download className="h-3.5 w-3.5" /> Download template
          </button>
          <button onClick={onDownloadExport} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-primary">
            <Download className="h-3.5 w-3.5" /> Export current data
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            {busy ? <span className="text-xs font-semibold text-muted-foreground">Working…</span> : null}
          </div>

          {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}

          {preview && !result ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                {preview.totalRows} row(s) — {preview.willCreate} will be created, {preview.willUpdate} will be
                updated, {preview.invalid} invalid.
              </p>
              {preview.rows.filter((r) => r.errors.length > 0).length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-xl bg-muted p-3 text-xs">
                  {preview.rows
                    .filter((r) => r.errors.length > 0)
                    .map((r) => (
                      <p key={r.row} className="text-destructive">
                        Row {r.row}: {r.errors.join("; ")}
                      </p>
                    ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <ActionButton type="button" onClick={handleImport} variant="primary" size="sm" disabled={busy || preview.willCreate + preview.willUpdate === 0}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Import {preview.willCreate + preview.willUpdate} valid row(s)
                </ActionButton>
                <ActionButton type="button" onClick={reset} variant="outline" size="sm">
                  Cancel
                </ActionButton>
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-success">
                Imported — {result.created} created, {result.updated} updated, {result.failed} row(s) failed.
              </p>
              {result.rowErrors.length > 0 ? (
                <div className="max-h-48 overflow-y-auto rounded-xl bg-muted p-3 text-xs">
                  {result.rowErrors.map((r) => (
                    <p key={r.row} className="text-destructive">
                      Row {r.row}: {r.errors.join("; ")}
                    </p>
                  ))}
                </div>
              ) : null}
              <ActionButton type="button" onClick={reset} variant="outline" size="sm">
                Import another file
              </ActionButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
