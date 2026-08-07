import { z } from "zod";

const PositiveIntegerSchema = z.coerce.number().int().positive();
const NonnegativeIntegerSchema = z.coerce.number().int().nonnegative();

const RawGlobalOptionsSchema = z.object({
  json: z.boolean().optional().default(false),
  quiet: z.boolean().optional().default(false),
  color: z.boolean().optional().default(true),
  timeout: PositiveIntegerSchema.optional().default(30_000),
  confirmations: NonnegativeIntegerSchema.optional().default(1),
});

export interface GlobalOptions {
  json: boolean;
  quiet: boolean;
  color: boolean;
  timeoutMs: number;
  confirmations: number;
}

export function parseGlobalOptions(input: unknown): GlobalOptions {
  const parsed = RawGlobalOptionsSchema.parse(input);
  return {
    json: parsed.json,
    quiet: parsed.quiet,
    color: parsed.color,
    timeoutMs: parsed.timeout,
    confirmations: parsed.confirmations,
  };
}
