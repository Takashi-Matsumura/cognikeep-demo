"use server";

import { revalidatePath } from "next/cache";
import { updateRelationStatus } from "@/lib/db/queries/governance";

function revalidateGovernanceViews() {
  revalidatePath("/governance");
  revalidatePath("/governance/duplicates");
  revalidatePath("/dashboard");
}

export async function dismissRelationAction(relationId: string) {
  updateRelationStatus(relationId, "dismissed");
  revalidateGovernanceViews();
}

export async function markRelationMergedAction(relationId: string) {
  updateRelationStatus(relationId, "merged");
  revalidateGovernanceViews();
}
