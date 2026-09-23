// ================================================================================
// TEST - src/cliArgs.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, requireFlag, CliUsageError } from "../src/cliArgs.js";

describe("parseArgs", () => {
  test("parses --flag value pairs", () => {
    const args = parseArgs(["--host", "10.0.0.5", "--device", "foh"]);
    assert.equal(args.host, "10.0.0.5");
    assert.equal(args.device, "foh");
  });

  test("a flag immediately followed by another flag becomes boolean true", () => {
    const args = parseArgs(["--verbose", "--host", "10.0.0.5"]);
    assert.equal(args.verbose, true);
    assert.equal(args.host, "10.0.0.5");
  });

  test("a trailing flag with no value becomes boolean true", () => {
    const args = parseArgs(["--help"]);
    assert.equal(args.help, true);
  });

  test("-h is shorthand for help: true", () => {
    const args = parseArgs(["-h"]);
    assert.equal(args.help, true);
  });

  test("-h after a flag's value doesn't get swallowed as that flag's value", () => {
    const args = parseArgs(["--host", "-h"]);
    assert.equal(args.host, true);
    assert.equal(args.help, true);
  });

  test("bare positional arguments collect into _", () => {
    const args = parseArgs(["scrape", "--host", "10.0.0.5", "extra"]);
    assert.deepEqual(args._, ["scrape", "extra"]);
  });

  test("empty argv parses to just an empty _ array", () => {
    assert.deepEqual(parseArgs([]), { _: [] });
  });
});

describe("requireFlag", () => {
  test("returns the value when the flag is present and non-empty", () => {
    const args = { host: "10.0.0.5" };
    assert.equal(requireFlag(args, "host", { command: "scrape", example: "10.0.0.5" }), "10.0.0.5");
  });

  test("throws a CliUsageError (not a generic Error) when the flag is missing", () => {
    assert.throws(() => requireFlag({}, "host", { command: "scrape", example: "10.0.0.5" }), CliUsageError);
  });

  test("throws when the flag was given with no value (bare boolean true)", () => {
    assert.throws(() => requireFlag({ host: true }, "host", { command: "scrape", example: "10.0.0.5" }), CliUsageError);
  });

  test("throws when the flag value is an empty string", () => {
    assert.throws(() => requireFlag({ host: "" }, "host", { command: "scrape", example: "10.0.0.5" }), CliUsageError);
  });

  test("error message is a short, actionable one-liner naming the command and example", () => {
    try {
      requireFlag({}, "host", { command: "scrape", example: "10.0.0.5" });
      assert.fail("expected requireFlag to throw");
    } catch (err) {
      assert.match(err.message, /^scrape requires --host <value>\. Try: node src\/cli\.js scrape --host 10\.0\.0\.5$/);
    }
  });
});
