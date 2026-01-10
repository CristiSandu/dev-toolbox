export type PrintState = "new" | "printing" | "done";

export interface PrintJob {
  id: number;
  batch_id: string;
  requested_by: string;
  payload: string;
  state: PrintState;
  print_count: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}
