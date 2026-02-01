import { Browser, chromium, firefox, webkit } from "playwright";

export type BrowserKind = "chromium" | "firefox" | "webkit";

export interface LaunchOptions {
  browser?: BrowserKind;
  headless?: boolean;
}

export async function launchBrowser(options: LaunchOptions = {}): Promise<Browser> {
  const browser = options.browser ?? "chromium";
  const headless = options.headless ?? true;
  switch (browser) {
    case "chromium":
      return chromium.launch({ headless });
    case "firefox":
      return firefox.launch({ headless });
    case "webkit":
      return webkit.launch({ headless });
    default:
      throw new Error(`Unsupported browser: ${browser}`);
  }
}
