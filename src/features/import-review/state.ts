import type {
  ColumnMapping,
  CsvDocument,
  CsvFailure,
  PreviewRow,
} from "@/server/import-review/csv";
export interface ImportReviewState {
  stage: "choose" | "mapping" | "problems";
  error?: CsvFailure | "failure";
  source?: {
    filename: string;
    document: CsvDocument;
    digest: string;
    token: string;
    mapping: ColumnMapping;
  };
  rows?: PreviewRow[];
}
export const initialImportReview: ImportReviewState = { stage: "choose" };
