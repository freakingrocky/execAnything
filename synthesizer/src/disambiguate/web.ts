export interface WebSelectorCandidate {
  kind: "web_css" | "web_text" | "web_role" | "web_label" | "web_xpath";
  confidence: number;
  selector: Record<string, unknown>;
  matched_count: number;
}

export interface WebDisambiguationHints {
  within_css?: string;
}

function addWithinScope(candidate: WebSelectorCandidate, withinCss: string): WebSelectorCandidate {
  if (candidate.kind === "web_text") {
    const selector = candidate.selector as { text?: string; exact?: boolean };
    return {
      ...candidate,
      confidence: Math.min(candidate.confidence + 0.05, 1),
      selector: {
        ...selector,
        within_css: withinCss,
      },
    };
  }

  if (candidate.kind === "web_css") {
    const selector = candidate.selector as { css?: string };
    const css = selector.css ? `${withinCss} ${selector.css}` : withinCss;
    return {
      ...candidate,
      confidence: Math.min(candidate.confidence + 0.05, 1),
      selector: {
        ...selector,
        css,
      },
    };
  }

  return candidate;
}

export function disambiguateWebCandidates(
  candidates: WebSelectorCandidate[],
  hints: WebDisambiguationHints,
): WebSelectorCandidate[] {
  const output: WebSelectorCandidate[] = [...candidates];
  const withinCss = hints.within_css;
  if (!withinCss) {
    return output;
  }

  for (const candidate of candidates) {
    if (candidate.matched_count <= 1) {
      continue;
    }
    if (candidate.kind !== "web_css" && candidate.kind !== "web_text") {
      continue;
    }
    output.push(addWithinScope(candidate, withinCss));
  }

  return output;
}
