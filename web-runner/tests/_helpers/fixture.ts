import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

export function fixtureUrl(metaUrl: string, ...segments: string[]): string {
  const directory = path.dirname(fileURLToPath(metaUrl));
  const fixturePath = path.join(directory, ...segments);
  return pathToFileURL(fixturePath).toString();
}
