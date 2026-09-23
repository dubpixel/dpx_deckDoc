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
