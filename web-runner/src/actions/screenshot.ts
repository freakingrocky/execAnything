import path from "path";
import { promises as fs } from "fs";
import { Page } from "playwright";

export async function captureScreenshot(
  page: Page,
  dir: string | undefined,
  name: string,
): Promise<string | undefined> {
  if (!dir) {
    return undefined;
  }
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, name);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}
