export interface WorkflowStep {
  id: string;
  kind: string;
  pre_assert?: unknown;
  post_assert?: unknown;
}

export interface WorkflowDefinition {
  id: string;
  name?: string;
  steps: WorkflowStep[];
}
