import { useCallback, useState } from "react";
import { Upload, Loader2, CheckCircle, XCircle } from "lucide-react";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "https://blade-web-production.up.railway.app";
const AUTH_TOKEN = import.meta.env.VITE_BLADE_TOKEN as string | undefined;

interface FileUploadZoneProps {
  onUploadComplete?: (file: { fileId: string; url: string; mimeType: string }) => void;
  accept?: string;
  label?: string;
}

export function FileUploadZone({
  onUploadComplete,
  accept = "image/*,.pdf,.txt,.csv,.md",
  label = "Drop files here or click to upload",
}: FileUploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setStatus("idle");
    const form = new FormData();
    form.append("file", file);

    try {
      const headers: Record<string, string> = {};
      if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
      const res = await fetch(`${API_URL}/api/upload`, { method: "POST", headers, body: form });
      const json = await res.json();
      if (json.success && json.data) {
        setStatus("success");
        onUploadComplete?.(json.data);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setUploading(false);
      setTimeout(() => setStatus("idle"), 3000);
    }
  }, [onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) upload(file);
  }, [upload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
  }, [upload]);

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-all ${
        dragging
          ? "border-[var(--blade-red)] bg-[var(--blade-red)]/10"
          : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
    >
      <input type="file" accept={accept} onChange={handleFileSelect} className="hidden" />
      {uploading ? (
        <Loader2 size={24} className="animate-spin text-white/40" />
      ) : status === "success" ? (
        <CheckCircle size={24} className="text-green-500" />
      ) : status === "error" ? (
        <XCircle size={24} className="text-red-500" />
      ) : (
        <Upload size={24} className="text-white/30" />
      )}
      <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-white/30">
        {uploading ? "uploading..." : label}
      </div>
    </label>
  );
}
