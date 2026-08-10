import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import { z } from "zod";

const CreatePayloadSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    type: z.enum(["contract", "app"]),
    name: z.string(),
    directory: z.string(),
    files: z.array(z.string()),
    buildCommand: z.string(),
  }),
});

const ErrorPayloadSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

interface ProcessResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function run(
  command: readonly string[],
  cwd: string,
  environment: Record<string, string | undefined>,
): Promise<ProcessResult> {
  const childProcess = spawn({
    cmd: [...command],
    cwd,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text(),
    childProcess.exited,
  ]);
  return { stdout, stderr, exitCode };
}

describe("giwa create commands", () => {
  let sandbox = "";
  let workspace = "";
  let environment: Record<string, string | undefined> = {};
  const cliPath = resolve(import.meta.dir, "cli.ts");

  beforeEach(async () => {
    sandbox = mkdtempSync(join(tmpdir(), "giwa-create-"));
    workspace = join(sandbox, "workspace");
    environment = {
      ...process.env,
      GIWA_CONFIG_DIR: join(sandbox, "global-config"),
    };
    const initialized = await run(
      ["bun", cliPath, "init", workspace, "--json"],
      sandbox,
      environment,
    );
    expect(initialized.exitCode).toBe(0);
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("creates and builds contract and app scaffolds", async () => {
    // given: an initialized GIWA workspace
    // when: both scaffold types are created
    const contract = await run(
      ["bun", cliPath, "create", "contract", "Counter", "--project", workspace, "--json"],
      sandbox,
      environment,
    );
    const app = await run(
      ["bun", cliPath, "create", "app", "block-viewer", "--project", workspace, "--json"],
      sandbox,
      environment,
    );
    const contractPayload = CreatePayloadSchema.parse(JSON.parse(contract.stdout));
    const appPayload = CreatePayloadSchema.parse(JSON.parse(app.stdout));
    const contractBuild = await run(
      ["forge", "build"],
      contractPayload.data.directory,
      environment,
    );
    const appBuild = await run(["bun", "run", "build"], appPayload.data.directory, environment);

    // then: generated artifacts compile without installing dependencies
    expect(contractPayload.data.buildCommand).toBe("forge build");
    expect(appPayload.data.buildCommand).toBe("bun run build");
    expect(contractBuild.exitCode).toBe(0);
    expect(appBuild.exitCode).toBe(0);
  });

  it("embeds the selected network as machine-consumed app constants", async () => {
    // given: a workspace using GIWA Sepolia
    // when: an app scaffold is generated
    await run(
      ["bun", cliPath, "create", "app", "network-viewer", "--project", workspace, "--json"],
      sandbox,
      environment,
    );
    const source = readFileSync(
      join(workspace, "apps", "network-viewer", "src", "index.ts"),
      "utf8",
    );

    // then: exact selected network values are embedded
    expect(source).toContain('"alias":"giwa-sepolia"');
    expect(source).toContain('"chainId":91342');
    expect(source).toContain('"rpcUrl":"https://sepolia-rpc.giwa.io"');
  });

  it("rejects unsafe names and missing workspaces", async () => {
    // given: unsafe names and a non-workspace directory
    // when: create is invoked
    const unsafeContract = await run(
      ["bun", cliPath, "create", "contract", "../Bad", "--project", workspace, "--json"],
      sandbox,
      environment,
    );
    const unsafeApp = await run(
      ["bun", cliPath, "create", "app", "Bad App", "--project", workspace, "--json"],
      sandbox,
      environment,
    );
    const missing = await run(
      ["bun", cliPath, "create", "app", "valid-app", "--project", sandbox, "--json"],
      sandbox,
      environment,
    );

    // then: inputs fail before writing outside configured targets
    expect(ErrorPayloadSchema.parse(JSON.parse(unsafeContract.stderr)).error.code).toBe(
      "INVALID_INPUT",
    );
    expect(ErrorPayloadSchema.parse(JSON.parse(unsafeApp.stderr)).error.code).toBe("INVALID_INPUT");
    expect(ErrorPayloadSchema.parse(JSON.parse(missing.stderr)).error.code).toBe(
      "PROJECT_NOT_FOUND",
    );
    expect(unsafeContract.exitCode).toBe(2);
    expect(unsafeApp.exitCode).toBe(2);
    expect(missing.exitCode).toBe(3);
  });

  it("preserves existing scaffold bytes", async () => {
    // given: an existing app target with user content
    const target = join(workspace, "apps", "existing-app");
    const marker = join(target, "keep.txt");
    mkdirSync(target);
    writeFileSync(marker, "keep me", "utf8");
    const before = readFileSync(marker);

    // when: create targets the same directory
    const result = await run(
      ["bun", cliPath, "create", "app", "existing-app", "--project", workspace, "--json"],
      sandbox,
      environment,
    );

    // then: typed failure leaves exact bytes intact
    expect(ErrorPayloadSchema.parse(JSON.parse(result.stderr)).error.code).toBe("SCAFFOLD_EXISTS");
    expect(result.exitCode).toBe(3);
    expect(readFileSync(marker)).toEqual(before);
  });
});
