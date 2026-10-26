import type { ImportReceipt } from "@/server/import-review/contracts";
import type {
  ColumnMapping,
  CsvDocument,
  CsvFailure,
  PreviewRow,
} from "@/server/import-review/csv";
export interface ImportReviewState {
  stage: "choose" | "mapping" | "problems" | "receipt";
  error?: CsvFailure | "failure";
  source?: {
    filename: string;
    document: CsvDocument;
    digest: string;
    token: string;
    mapping: ColumnMapping;
  };
  rows?: PreviewRow[];
  operationKey?: string;
  receipt?: ImportReceipt;
}
export const initialImportReview: ImportReviewState = { stage: "choose" };
