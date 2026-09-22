#!/bin/bash
# dpx_claudeDeck status hook — writes/removes this project's status file so
# dpx_claudeDeck's Stream Deck button overlay (issues #12/#13) can show it.
#
# Installed by the dpx-claudedeck-status skill into a project's own
# .claude/dpx-claudedeck-status-hook.sh — never edit this copy in
# ~/.claude/skills/dpx-claudedeck-status/, edit the per-project one instead.
#
# Usage: dpx-claudedeck-status-hook.sh <event>
#   event: sessionstart | pretooluse | notification | stop | sessionend
# Hook JSON payload (Claude Code's standard hook stdin) is read for the
# `notification` event only, to branch on notification_type/subtype.

set -euo pipefail

EVENT="${1:-}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
# Real bug found in testing: the directory basename does NOT always match
# what dpx_claudeDeck derives from the VS Code window title (e.g. a folder
# named "dpx_server_operations" whose VS Code window title/workspace name
# is the shorter "dpx_server_ops") — there is no reliable way for a hook
# script to know VS Code's exact derived name in advance. If
# ".claude/dpx-claudedeck-project-name" exists (one line, no trailing
# newline needed), it wins; otherwise fall back to the directory basename,
# which is correct for the common case where they match.
if [ -f "$PROJECT_DIR/.claude/dpx-claudedeck-project-name" ]; then
  PROJECT_NAME="$(cat "$PROJECT_DIR/.claude/dpx-claudedeck-project-name")"
else
  PROJECT_NAME="$(basename "$PROJECT_DIR")"
fi
# Same sanitization as claude-status.js's sanitizeStatusKey — must match
# exactly or dpx_claudeDeck will never find this file.
SAFE_NAME="$(echo "$PROJECT_NAME" | sed 's/[^a-zA-Z0-9._-]/_/g')"
STATUS_DIR="$HOME/Library/Application Support/dpx_claudedeck/claude-status"
STATUS_FILE="$STATUS_DIR/$SAFE_NAME.json"

write_status() {
  local status="$1"
  mkdir -p "$STATUS_DIR"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"status":"%s","updatedAt":"%s"}\n' "$status" "$now" > "$STATUS_FILE"
}

case "$EVENT" in
  sessionstart)
    # Fires the moment a session begins, before any tool call — closes the
    # gap where a freshly-hooked project shows no badge at all until its
    # first PreToolUse. Same "working" status; SessionStart just fires
    # earlier than the first real tool use would.
    write_status "working"
    ;;
  pretooluse)
    # A tool is about to run — the session is actively working.
    write_status "working"
    ;;
  notification)
    # Read stdin JSON to distinguish a real block from Claude Code's benign
    # ~60s idle nudge (idle_prompt) — confirmed as a real false-positive
    # trap by prior art (xz-code/claude-traffic-light), do not treat it as
    # blocked. PermissionRequest was found unreliable in the same prior
    # art's testing, so this checks notification_type/subtype broadly
    # rather than depending on one specific field name that may vary by
    # Claude Code version.
    PAYLOAD="$(cat)"
    if echo "$PAYLOAD" | grep -qi "idle_prompt"; then
      exit 0
    fi
    write_status "blocked"
    ;;
  stop)
    # Main turn finished — done, not mid-subagent-turn (SubagentStop is
    # intentionally NOT wired to this script; a subagent finishing isn't
    # the main session finishing, per prior art's treatment of it as
    # still-working).
    write_status "complete"
    ;;
  sessionend)
    # Session fully ended — remove the status file entirely rather than
    # leaving a stale "complete" badge showing forever on a project with
    # no active session.
    rm -f "$STATUS_FILE"
    ;;
  *)
    echo "dpx-claudedeck-status-hook.sh: unknown event '$EVENT'" >&2
    exit 1
    ;;
esac
