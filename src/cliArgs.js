// ================================================================================
// CLI ARGS - flag parsing, --help/-h detection, friendly required-flag checks
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/cliArgs.js
// Purpose: Pure argument-parsing/validation helpers shared by every src/cli.js
//          subcommand — split out of cli.js so they're unit-testable without
//          touching the filesystem or network (see issue #9: a beginner
//          hitting an uncaught exception/raw stack trace on a missing flag
//          is exactly what this replaces with a one-line, actionable
//          message).
// Dependencies: none
//
// ================================================================================

/**
 * Thrown for any "the user typed something invalid" situation (missing or
 * malformed flag). Caught by cli.js's top-level handler and printed as a
 * single friendly line instead of a stack trace — never let this class of
 * error reach the default `main().catch()` uncaught-exception path silently
 * turn into a wall of Node internals.
 */
export class CliUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "CliUsageError";
  }
}

/**
 * Splits argv into `{ _: [...positional], flag: value|true, ... }`.
 * `--flag value` -> string value; `--flag` alone (or followed by another
 * flag) -> boolean `true`. Also recognizes `-h` as shorthand for `help: true`
 * so `--help`/`-h` behave identically everywhere.
 *
 * @param {string[]} argv
 * @returns {Record<string, unknown> & { _: string[] }}
 */
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h") {
      args.help = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && next !== "-h") {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

/**
 * Requires `args[name]` to be present and to be a real value (not the bare
 * `true` a flag gets when written with no following value). Throws a
 * friendly, actionable CliUsageError otherwise — never lets a missing flag
 * fall through to a raw TypeError/undefined deeper in the pipeline.
 *
 * @param {Record<string, unknown>} args
 * @param {string} name - flag name, without leading `--`
 * @param {object} opts
 * @param {string} opts.command - subcommand name, for the message ("scrape")
 * @param {string} opts.example - example value shown in the "Try:" line ("10.0.0.5")
 * @returns {string} the validated flag value
 */
export function requireFlag(args, name, { command, example }) {
  const value = args[name];
  if (value === undefined || value === true || value === "") {
    throw new CliUsageError(
      `${command} requires --${name} <value>. Try: node src/cli.js ${command} --${name} ${example}`
    );
  }
  return value;
}

/**
 * Reads an OPTIONAL string flag, falling back to `fallback` whenever the
 * flag wasn't a real string — including the bare boolean `true` parseArgs()
 * produces for a flag typed with no following value (e.g. `--out` as the
 * last argument, or immediately followed by another `--flag`). Found while
 * QA-testing issue #9: every subcommand piped `args.out ?? "devices"`
 * straight into `path.join()`, so `--out` with no value passed the literal
 * boolean `true` through and crashed with a raw Node internal error ("The
 * 'path' argument must be of type string. Received type boolean (true)")
 * instead of just falling back — the same class of confusing/uncaught
 * error issue #9 exists to eliminate, just via a bug rather than a missing
 * flag. Use this for any optional flag a command later hands to fs/path.
 *
 * @param {Record<string, unknown>} args
 * @param {string} name - flag name, without leading `--`
 * @param {string} [fallback] - value to use when the flag isn't a usable string
 * @returns {string|undefined}
 */
export function stringFlag(args, name, fallback) {
  const value = args[name];
  return typeof value === "string" && value !== "" ? value : fallback;
}
