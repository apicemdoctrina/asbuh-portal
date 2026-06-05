/**
 * Versioning for legal documents shown to clients on first login.
 *
 * When a document text changes (apps/web/src/legal/*.md), bump the version here.
 * Existing accepted_at rows for the OLD version remain (audit trail), but the user
 * will be re-prompted to accept the new version.
 *
 * Document types are required ONLY for users with the "client" role. Staff are
 * covered by employment contract and not gated by this consent flow.
 */

export type LegalDocumentType = "terms_of_use" | "personal_data";

export const CURRENT_VERSIONS: Record<LegalDocumentType, string> = {
  terms_of_use: "2.0",
  personal_data: "2.0",
};

export const REQUIRED_FOR_CLIENT: LegalDocumentType[] = ["terms_of_use", "personal_data"];

export const DOCUMENT_LABELS: Record<LegalDocumentType, string> = {
  terms_of_use: "Пользовательское соглашение",
  personal_data: "Согласие на обработку персональных данных",
};
