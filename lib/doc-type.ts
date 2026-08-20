export const DOC_TYPE_LABEL: Record<string, string> = {
  regulation: "規程",
  manual: "手順書",
  contract: "契約",
  minutes: "議事録",
  report: "報告書",
  slide: "スライド",
  sheet: "表計算",
  other: "その他",
};

export const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export function docTypeLabel(docType: string): string {
  return DOC_TYPE_LABEL[docType] ?? docType;
}
