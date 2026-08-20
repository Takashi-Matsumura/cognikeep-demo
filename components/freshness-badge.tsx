import { Badge } from "@/components/ui/badge";
import { FRESHNESS_BAND_LABEL, type FreshnessBand } from "@/lib/governance/freshness";

const VARIANT: Record<FreshnessBand, "default" | "secondary" | "destructive"> = {
  healthy: "secondary",
  review: "default",
  action: "destructive",
};

export function FreshnessBadge({ score, band }: { score: number; band: FreshnessBand }) {
  return (
    <Badge variant={VARIANT[band]}>
      {FRESHNESS_BAND_LABEL[band]} ({Math.round(score)})
    </Badge>
  );
}
