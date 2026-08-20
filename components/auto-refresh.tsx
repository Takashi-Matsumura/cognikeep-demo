"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * ジョブ画面等、バックグラウンド処理の進行を見せたい画面向けの単純なポーリング。
 * SSE を使うほどではない PoC のスコープなので router.refresh() の定期実行で済ませる。
 */
export function AutoRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
