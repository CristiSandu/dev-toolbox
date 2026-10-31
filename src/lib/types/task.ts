import type { JiraType } from "@/features/screenshot/parse-jira";

export interface Task {
  id: number;
  name: string;
  number: string;
  feature_type: string;
  branch: string;
  pr_title: string;
  created_at: string;
  jira_issue_type?: JiraType | null;
}
