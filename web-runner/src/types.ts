export interface WebTargetRung {
  kind: "web_role" | "web_label" | "web_css" | "web_text" | "web_xpath";
  confidence: number;
  selector: Record<string, unknown>;
  notes?: string;
}

export interface WebTargetScope {
  url_contains?: string;
  title_contains?: string;
  frame?: string;
}

export interface WebTarget {
  ladder: WebTargetRung[];
  scope?: WebTargetScope;
}

export interface MatchAttempt {
  rung_index: number;
  kind: string;
  matched_count: number;
  duration_ms: number;
  ok: boolean;
  error?: string;
}

export interface ResolvedElement {
  rung_index: number;
  kind: string;
  selector: Record<string, unknown>;
}

export interface WebStepTrace {
  run_id: string;
  step_id: string;
  started_at: string;
  ended_at: string;
  ok: boolean;
  match_attempts: MatchAttempt[];
  resolved?: ResolvedElement;
  before_screenshot_path?: string;
  after_screenshot_path?: string;
  error?: string;
  error_code?: number;
  value?: string;
}

export interface WebAssertion {
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
    | "not";
  target?: WebTarget;
  text?: string;
  value?: string;
  url_contains?: string;
  url_equals?: string;
  title_contains?: string;
  timeout_ms?: number;
  assert?: WebAssertion;
}
