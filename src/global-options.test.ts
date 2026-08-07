import { describe, expect, it } from "bun:test";
import { parseGlobalOptions } from "./global-options.js";

describe("parseGlobalOptions", () => {
  it("applies deterministic defaults", () => {
    // given: Commander provides no global options
    // when: options cross the Zod boundary
    const options = parseGlobalOptions({});

    // then: every consumer receives concrete defaults
    expect(options).toEqual({
      json: false,
      quiet: false,
      color: true,
      timeoutMs: 30_000,
      confirmations: 1,
    });
  });

  it("rejects invalid numeric boundaries", () => {
    // given: invalid timeout and confirmation values
    // when: options cross the Zod boundary
    const parseTimeout = () => parseGlobalOptions({ timeout: 0 });
    const parseConfirmations = () => parseGlobalOptions({ confirmations: -1 });

    // then: both invalid values are rejected
    expect(parseTimeout).toThrow();
    expect(parseConfirmations).toThrow();
  });
});
