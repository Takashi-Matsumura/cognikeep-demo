"use client";

import { useCallback, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UploadNewVersion({ documentId }: { documentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onFileInput = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      setUploading(true);
      setMessage(null);
      try {
        const formData = new FormData();
        formData.append("files", file);
        formData.append("documentId", documentId);
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        const result = data.results?.[0];
        if (!result?.ok) {
          setMessage(result?.error ?? "アップロードに失敗しました");
        } else if (result.isDuplicate) {
          setMessage("既存の版と同一内容のため、新しい版は作成されませんでした");
        } else {
          setMessage("新しい版を取り込みました。変換中です。");
          router.refresh();
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
      }
    },
    [documentId, router],
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.xlsx,.pdf"
        onChange={onFileInput}
        disabled={uploading}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "アップロード中…" : "新しい版をアップロード"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
