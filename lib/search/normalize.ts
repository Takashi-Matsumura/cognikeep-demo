/**
 * NFKC 正規化した文字列と、「正規化後の各文字が原文のどこから来たか」のオフセット
 * マップを同時に作る。
 *
 * なぜ必要か: FTS5 の索引列は分かち書き済み文字列であり、`snippet()` /
 * `highlight()` は使えない。ハイライトとスニペットは原文（chunks.text）に
 * 対してアプリ側で作る必要がある。しかし原文には全角英数字（Ｐａｓｓｗｏｒｄ）や
 * 互換文字（㍿）が混じり、素の indexOf では見つからない。かといって NFKC は
 * 文字数を変える（㍿ → 株式会社）ので、正規化後の一致位置をそのまま原文の
 * オフセットとして使うことはできない。1コードポイントずつ正規化しながら
 * 「正規化後インデックス → 原文インデックス」を記録することで、正規化後の
 * 一致範囲を原文の範囲へ正確に戻せるようにする。
 */
export interface NormalizedText {
  normalized: string;
  /** map[i] = 正規化後の位置 i に対応する原文中の開始位置。map[normalized.length] は原文の終端（番兵）。 */
  map: number[];
}

export function normalizeWithMap(text: string): NormalizedText {
  const map: number[] = [];
  let normalized = "";
  let origIndex = 0;
  for (const ch of text) {
    // for...of はコードポイント単位でイテレートするのでサロゲートペアも安全
    const n = ch.normalize("NFKC").toLowerCase();
    for (const nc of n) {
      normalized += nc;
      map.push(origIndex);
    }
    origIndex += ch.length; // ch.length は UTF-16 コード単位数（1 または 2）
  }
  map.push(text.length);
  return { normalized, map };
}

/** 正規化後の [start, end) を原文の [start, end) に変換する */
export function toOriginalRange(
  map: number[],
  normalizedStart: number,
  normalizedEnd: number,
): { start: number; end: number } {
  return { start: map[normalizedStart], end: map[normalizedEnd] };
}
