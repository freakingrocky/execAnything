export interface CliArgs {
  workflow?: string;
  inputs?: string;
  out?: string;
  config?: string;
  recordings?: string[];
  resume?: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  let index = 0;

  while (index < argv.length) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      index += 1;
      continue;
    }

    const key = token.slice(2);
    if (key === "recordings") {
      const values: string[] = [];
      index += 1;
      while (index < argv.length && !argv[index].startsWith("--")) {
        values.push(argv[index]);
        index += 1;
      }
      if (values.length > 0) {
        args.recordings = values;
      }
      continue;
    }

    if (key === "resume") {
      args.resume = true;
      index += 1;
      continue;
    }

    const value = argv[index + 1];
    if (value && !value.startsWith("--")) {
      args[key as keyof CliArgs] = value as never;
      index += 2;
      continue;
    }

    args[key as keyof CliArgs] = "" as never;
    index += 1;
  }

  return args;
}
