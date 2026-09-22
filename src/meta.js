// ================================================================================
// META - version + git info for the standard dpx topbar
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/meta.js
// Purpose: Reads VERSION and current git branch/commit for display in the
//          standard dpx topbar (logo, version, GitHub link, branch, commit).
// Dependencies: none
//
// ================================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const GITHUB_URL = "https://github.com/dubpixel/dpx_deckDoc";

export function getVersion() {
  try {
    return fs.readFileSync(path.join(REPO_ROOT, "VERSION"), "utf8").trim();
  } catch {
    return "0.0.0";
  }
}

export function getGitInfo() {
  const run = (cmd) => execSync(cmd, { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  try {
    return { branch: run("git rev-parse --abbrev-ref HEAD"), sha: run("git rev-parse --short HEAD") };
  } catch {
    return { branch: null, sha: null };
  }
}

export function getMeta() {
  const { branch, sha } = getGitInfo();
  return { version: getVersion(), branch, sha, githubUrl: GITHUB_URL };
}
