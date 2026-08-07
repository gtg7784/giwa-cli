import { describe, expect, it } from "bun:test";
import { ApplicationError, EXIT_CODES } from "./errors.js";
import { formatError, formatSuccess } from "./output.js";

describe("output contracts", () => {
  it("quiet mode suppresses successful JSON", () => {
    // given: quiet and JSON modes are both enabled
    // when: success output is formatted
    const output = formatSuccess({ value: 1 }, "done", { json: true, quiet: true });

    // then: quiet mode wins deterministically
    expect(output).toBe("");
  });

  it("errors remain machine-readable", () => {
    // given: a typed network error
    const error = new ApplicationError("RPC_UNREACHABLE", "RPC is unavailable", EXIT_CODES.network);

    // when: JSON error output is formatted
    const output = formatError(error, true);

    // then: its public code and message are preserved
    expect(JSON.parse(output)).toEqual({
      ok: false,
      error: { code: "RPC_UNREACHABLE", message: "RPC is unavailable" },
    });
  });
});
