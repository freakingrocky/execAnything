export function minimizeSelector<T extends Record<string, unknown>>(
  selector: T,
  keysInOrder: string[],
  isValid: (candidate: T) => boolean,
): T {
  let current = { ...selector };

  for (const key of keysInOrder) {
    if (!(key in current)) {
      continue;
    }
    const candidate = { ...current } as T;
    delete candidate[key as keyof T];
    if (isValid(candidate)) {
      current = candidate;
    }
  }

  return current;
}

export function minimizeDesktopSelector(selector: Record<string, unknown>): Record<string, unknown> {
  const isValid = (candidate: Record<string, unknown>): boolean => {
    const automationId = candidate.automationId;
    const name = candidate.name;
    const controlType = candidate.controlType;
    const hasAutomationId = typeof automationId === "string" && automationId.length > 0;
    const hasName = typeof name === "string" && name.length > 0;
    const hasControlType = typeof controlType === "string" && controlType.length > 0;
    return hasAutomationId || (hasName && hasControlType);
  };

  return minimizeSelector(
    selector,
    ["className", "controlType", "name"],
    isValid,
  );
}
