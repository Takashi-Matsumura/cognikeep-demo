"use server";

import { revalidatePath } from "next/cache";
import {
  markReviewed,
  extendReview,
  setOwnerByName,
  setDocType,
  archiveDocument,
} from "@/lib/db/queries/review";

function revalidateDocumentViews(documentId: string) {
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/dashboard");
  revalidatePath("/governance");
  revalidatePath("/governance/stale");
}

export async function markReviewedAction(documentId: string, formData: FormData) {
  const note = formData.get("note");
  markReviewed(documentId, typeof note === "string" && note.trim() ? note.trim() : undefined);
  revalidateDocumentViews(documentId);
}

export async function extendReviewAction(documentId: string, formData: FormData) {
  const days = Number(formData.get("days"));
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("延長日数は正の数で指定してください");
  }
  extendReview(documentId, days);
  revalidateDocumentViews(documentId);
}

export async function setOwnerAction(documentId: string, formData: FormData) {
  const name = formData.get("ownerName");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("オーナー名を入力してください");
  }
  setOwnerByName(documentId, name);
  revalidateDocumentViews(documentId);
}

export async function setDocTypeAction(documentId: string, formData: FormData) {
  const docType = formData.get("docType");
  if (typeof docType !== "string" || !docType) {
    throw new Error("種別を選択してください");
  }
  setDocType(documentId, docType);
  revalidateDocumentViews(documentId);
}

export async function archiveDocumentAction(documentId: string) {
  archiveDocument(documentId);
  revalidateDocumentViews(documentId);
}
