// 重複・類似検知の基礎になる SimHash / Jaccard / Containment。
//
// 実装計画では 64bit SimHash としているが、`node:sqlite` の INTEGER 列は
// JS の Number で受け渡しする限り安全な整数範囲（2^53 未満）に収める必要が
// あり、64bit 符号付き値をそのまま格納すると `readBigInts` をプロジェクト
// 全体で有効化する必要が生じてコストが見合わない（他の全クエリが BigInt
// 前提になってしまう）。数百〜数千件規模の重複検知には 48bit で
// 実用上十分なため、48bit に落として素の Number として扱う。

import { tokenizeToArray } from "../search/segment.ts";

const MASK48 = (1n << 48n) - 1n;
const MASK64 = (1n << 64n) - 1n;
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

function fnv1a64(str: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK64;
  }
  return hash;
}

/** 分かち書きしたトークンの n-gram（既定3-gram）シングルを作る */
export function shingles(text: string, n = 3): string[] {
  const tokens = tokenizeToArray(text);
  if (tokens.length === 0) return [];
  if (tokens.length < n) return [tokens.join(" ")];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

/** 48bit SimHash フィンガープリント（0 以上の安全な整数として返る） */
export function simhash48(text: string, n = 3): number {
  const grams = shingles(text, n);
  if (grams.length === 0) return 0;

  const weights = new Array<number>(48).fill(0);
  for (const gram of grams) {
    const h = fnv1a64(gram) & MASK48;
    for (let bit = 0; bit < 48; bit++) {
      weights[bit] += ((h >> BigInt(bit)) & 1n) === 1n ? 1 : -1;
    }
  }

  let fingerprint = 0n;
  for (let bit = 0; bit < 48; bit++) {
    if (weights[bit] > 0) fingerprint |= 1n << BigInt(bit);
  }
  return Number(fingerprint);
}

export function hammingDistance48(a: number, b: number): number {
  let x = (BigInt(a) ^ BigInt(b)) & MASK48;
  let count = 0;
  for (let i = 0; i < 48; i++) {
    if (x & 1n) count++;
    x >>= 1n;
  }
  return count;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 「片方がもう片方にほぼ包含されている」を検出する（版違いの本命指標） */
export function containment(a: Set<string>, b: Set<string>): number {
  const minSize = Math.min(a.size, b.size);
  if (minSize === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  return intersection / minSize;
}
