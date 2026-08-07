import { existsSync, mkdirSync, readFileSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { ApplicationError, EXIT_CODES } from "./errors.js";

export const PROJECT_CONFIG_FILE = "giwa.config.json";

const RelativeDirectorySchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) =>
      !isAbsolute(value) &&
      value !== "." &&
      !value.split(/[\\/]/).some((segment) => segment === ".."),
    "must be a safe relative directory",
  );

const ProjectConfigSchema = z
  .object({
    version: z.literal(1),
    selectedNetwork: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(64),
    contracts: RelativeDirectorySchema,
    apps: RelativeDirectorySchema,
  })
  .refine((config) => config.contracts !== config.apps, {
    message: "contracts and apps directories must differ",
  });

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

function configError(code: string, message: string): ApplicationError {
  return new ApplicationError(code, message, EXIT_CODES.config);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createProjectConfig(selectedNetwork: string): ProjectConfig {
  return ProjectConfigSchema.parse({
    version: 1,
    selectedNetwork,
    contracts: "contracts",
    apps: "apps",
  });
}

export function projectConfigPath(directory: string): string {
  return join(directory, PROJECT_CONFIG_FILE);
}

export function loadProjectConfig(directory: string): ProjectConfig {
  const configPath = projectConfigPath(directory);
  let content: string;
  try {
    content = readFileSync(configPath, "utf8");
  } catch (error) {
    throw configError(
      "PROJECT_CONFIG_READ_ERROR",
      `Failed to read ${PROJECT_CONFIG_FILE}: ${describeError(error)}`,
    );
  }

  let input: unknown;
  try {
    input = JSON.parse(content);
  } catch (error) {
    throw configError(
      "PROJECT_CONFIG_MALFORMED",
      `${PROJECT_CONFIG_FILE} is not valid JSON: ${describeError(error)}`,
    );
  }

  const result = ProjectConfigSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
  throw configError("PROJECT_CONFIG_INVALID", `Project config validation failed: ${details}`);
}

export function saveProjectConfig(directory: string, config: ProjectConfig): void {
  const parsed = ProjectConfigSchema.parse(config);
  try {
    writeFileSync(projectConfigPath(directory), `${JSON.stringify(parsed, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o644,
    });
  } catch (error) {
    throw configError(
      "PROJECT_CONFIG_WRITE_ERROR",
      `Failed to create ${PROJECT_CONFIG_FILE}: ${describeError(error)}`,
    );
  }
}

export function createWorkspaceDirectories(
  directory: string,
  config: ProjectConfig,
): readonly string[] {
  const created: string[] = [];
  try {
    for (const relativePath of [config.contracts, config.apps]) {
      const target = join(directory, relativePath);
      if (!existsSync(target)) {
        mkdirSync(target, { recursive: true });
        created.push(target);
      } else if (!statSync(target).isDirectory()) {
        throw configError("WORKSPACE_PATH_NOT_DIRECTORY", `${relativePath} is not a directory`);
      }
    }
    return created;
  } catch (error) {
    for (const target of created.reverse()) {
      rmdirSync(target);
    }
    throw error;
  }
}
