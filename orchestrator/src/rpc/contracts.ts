export const DesktopRpcMethods = {
  systemPing: "system.ping",
  systemGetCapabilities: "system.getCapabilities",
  runBegin: "run.begin",
  runEnd: "run.end",
  windowFocus: "window.focus",
  targetResolve: "target.resolve",
  actionClick: "action.click",
  actionPasteText: "action.pasteText",
  actionSetValue: "action.setValue",
  assertCheck: "assert.check",
  extractGetValue: "extract.getValue",
  artifactScreenshot: "artifact.screenshot",
} as const;

export type DesktopRpcMethod =
  (typeof DesktopRpcMethods)[keyof typeof DesktopRpcMethods];
