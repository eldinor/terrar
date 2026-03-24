declare module "node:fs/promises" {
  export function mkdir(
    path: string,
    options?: { recursive?: boolean },
  ): Promise<unknown>;

  export function readFile(
    file: string,
    options?: string,
  ): Promise<string>;

  export function writeFile(
    file: string,
    data: string | Uint8Array,
    options?: string,
  ): Promise<void>;

  export function rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;

  export function mkdtemp(
    prefix: string,
  ): Promise<string>;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare const process: {
  argv: string[];
  exitCode?: number;
  cwd(): string;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
};
