import { Badge } from "@/components/ui/badge";

export function ConversionBadge({
  engine,
  confidence,
}: {
  engine: string | null;
  confidence: number | null;
}) {
  if (!engine) {
    return <Badge variant="secondary">未変換</Badge>;
  }

  const isAi = engine.startsWith("claude:");
  const isLowConfidence = confidence != null && confidence < 0.6;
  const label = isAi
    ? `AI変換 (${engine.replace("claude:", "")})`
    : `ローカル変換${confidence != null ? ` (信頼度 ${confidence.toFixed(2)})` : ""}`;

  return (
    <Badge variant={isLowConfidence ? "destructive" : isAi ? "default" : "secondary"}>
      {isLowConfidence ? `要確認 (${confidence!.toFixed(2)})` : label}
    </Badge>
  );
}
