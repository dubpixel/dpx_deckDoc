// ================================================================================
// TEST - src/meta.js
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getVersion, getGitInfo, getMeta } from "../src/meta.js";

describe("getVersion", () => {
  test("reads a semver-shaped string from the repo's VERSION file", () => {
    const version = getVersion();
    assert.match(version, /^\d+\.\d+\.\d+$/);
  });
});

describe("getGitInfo", () => {
  test("returns a branch and short sha when run inside this git repo", () => {
    const { branch, sha } = getGitInfo();
    assert.equal(typeof branch, "string");
    assert.match(sha, /^[0-9a-f]{7,}$/);
  });
});

describe("getMeta", () => {
  test("combines version, git info, and the fixed GitHub URL", () => {
    const meta = getMeta();
    assert.equal(meta.version, getVersion());
    assert.equal(meta.githubUrl, "https://github.com/dubpixel/dpx_deckDoc");
    assert.ok(meta.branch);
    assert.ok(meta.sha);
  });
});
