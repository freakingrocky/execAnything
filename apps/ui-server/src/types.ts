export interface WorkflowTarget {
  ladder?: Array<{
    kind: string;
    selector?: Record<string, unknown>;
  }>;
}

export interface WorkflowStep {
  id: string;
  driver: "desktop" | "web";
  action: string;
  target?: WorkflowTarget;
  pre_assert?: Array<{ kind: string }>;
  post_assert?: Array<{ kind: string }>;
  explain?: string;
}

export interface WorkflowDefinition {
  id: string;
  name?: string;
  steps: WorkflowStep[];
}

export interface WorkflowRecord {
  id: string;
  name?: string;
  path: string;
  inputsPath?: string;
  steps: WorkflowStep[];
}
