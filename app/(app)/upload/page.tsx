"use client";

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface UploadResult {
  filename: string;
  ok: boolean;
  documentId?: string;
  isDuplicate?: boolean;
  error?: string;
}

const ACCEPTED_EXTENSIONS = [".docx", ".xlsx", ".pdf"];

export default function UploadPage() {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    setResults([]);
    try {
      const formData = new FormData();
      for (const file of list) formData.append("files", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      setResults(data.results ?? []);
    } catch (err) {
      setResults(
        list.map((f) => ({
          filename: f.name,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      );
    } finally {
      setUploading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files);
    },
    [upload],
  );

  const onFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) void upload(e.target.files);
      e.target.value = "";
    },
    [upload],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">アップロード</h1>
        <p className="text-sm text-muted-foreground">
          対応形式: Word (.docx) / Excel (.xlsx) / PDF（テキスト層あり）。
          アップロード後、バックグラウンドで自動的に Markdown に変換されます。
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
          dragOver ? "border-primary bg-secondary/50" : "border-border"
        }`}
      >
        <p className="text-sm text-muted-foreground">
          ここにファイルをドラッグ&ドロップ、またはクリックして選択
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={onFileInput}
          disabled={uploading}
          className="hidden"
        />
        <Button
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          ファイルを選択
        </Button>
        {uploading && <p className="text-sm text-muted-foreground">アップロード中…</p>}
      </div>

      {results.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 py-4">
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{r.filename}</span>
                {r.ok ? (
                  <span className="text-xs text-muted-foreground">
                    {r.isDuplicate ? "既存文書として検出（重複）" : "取り込み完了、変換中"}
                  </span>
                ) : (
                  <span className="text-xs text-destructive">{r.error}</span>
                )}
              </div>
            ))}
            <div className="pt-2">
              <Link href="/jobs" className="text-sm text-primary underline underline-offset-2">
                ジョブの進行状況を見る →
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
