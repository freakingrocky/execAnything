import { Browser, chromium } from "playwright";

export interface AttachOptions {
  endpoint: string;
}

export async function attachBrowser(options: AttachOptions): Promise<Browser> {
  if (!options.endpoint) {
    throw new Error("Missing attach endpoint");
  }
  return chromium.connectOverCDP(options.endpoint);
}
