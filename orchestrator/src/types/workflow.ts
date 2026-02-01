export type InputValue =
  | string
  | number
  | boolean
  | null
  | {
      var: string;
      transform?: "none" | "trim" | "upper" | "lower";
    };

export interface TargetRung {
  kind:
    | "web_role"
    | "web_label"
    | "web_css"
    | "web_text"
    | "web_xpath"
    | "uia"
    | "uia_near_label"
    | "uia_path"
    | "ocr_anchor"
    | "coords";
  confidence: number;
  selector: Record<string, unknown>;
  notes?: string;
}

export interface WebScope {
  url_contains?: string;
  title_contains?: string;
  frame?: string;
}

export interface DesktopScope {
  process_name?: string;
  window_title_contains?: string;
  window_class?: string;
}

export interface TargetScope {
  web?: WebScope;
  desktop?: DesktopScope;
}

export interface WorkflowTarget {
  ladder: TargetRung[];
  scope?: TargetScope | DesktopScope | WebScope;
}

export interface RetryPolicy {
  attempts: number;
  wait_ms: number;
  backoff?: "none" | "linear" | "exponential";
}

export interface Assertion {
  kind:
    | "web_exists"
    | "web_visible"
    | "web_url_contains"
    | "web_url_equals"
    | "web_title_contains"
    | "web_text_contains"
    | "web_text_equals"
    | "web_value_equals"
    | "web_value_contains"
    | "desktop_window_active"
    | "desktop_element_exists"
    | "desktop_element_visible"
    | "desktop_focused_controlType"
    | "desktop_value_equals"
    | "desktop_value_contains"
    | "not";
  target?: WorkflowTarget;
  controlType?: string;
  text?: string;
  value?: string;
  url_contains?: string;
  url_equals?: string;
  title_contains?: string;
  timeout_ms?: number;
  assert?: Assertion;
}

export interface WorkflowStep {
  id: string;
  driver: "desktop" | "web";
  action: string;
  target?: WorkflowTarget;
  input?: InputValue;
  params?: Record<string, unknown>;
  retry?: RetryPolicy;
  timeouts?: {
    step_timeout_ms?: number;
    wait_timeout_ms?: number;
  };
  pre_assert?: Assertion[];
  post_assert?: Assertion[];
}

export interface WorkflowDefinition {
  id: string;
  name?: string;
  steps: WorkflowStep[];
}
