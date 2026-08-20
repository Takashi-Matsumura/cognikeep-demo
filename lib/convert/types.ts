export interface LocalConversionResult {
  /** ページ/シート/スライドのアンカー（&lt;!-- page:N --&gt; 等）込みの Markdown 本文 */
  markdown: string;
  /** 品質ゲート判定用の生テキスト。PDF はページ単位、xlsx はシート単位 */
  pageTexts: string[];
  pageCount: number | null;
  sheetNames?: string[];
}
