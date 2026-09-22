// ================================================================================
// CAPTURE BACKEND - Companion Satellite API
// ================================================================================
// PROJECT: dpx_deckDoc
// ================================================================================
//
// File: src/capture/satellite.js
// Purpose: Connects to a Companion instance as a Satellite API client and
//          subscribes to individual button locations to pull their rendered
//          bitmap images, without registering as a full surface/device.
// Dependencies: none (plain Node `net` sockets)
//
// Protocol reference: https://companion.free/for-developers/Satellite-API/
// (default TCP port 16622, plaintext line protocol)
//
// VERSION GATE (confirmed 2026-09-22 against the dev instance at
// 10.196.11.26, running Companion 4.2.5): ADD-SUB / the read-only Button
// Subscription API is NOT implemented on that version — it replies
// `ERROR MESSAGE="Unknown command: ADD-SUB"`. Companion's changelog lists
// "Expand satellite api to cover full module and elgato plugin
// functionality" under v4.3.0, which lines up with this gap. This module
// will only work against Companion >= ~4.3.0. On older instances, use the
// screenshot backend (src/capture/screenshot.js) instead — it was verified
// working end-to-end against the 4.2.5 dev instance.
//
// ================================================================================

import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";

const SATELLITE_PORT = 16622;
const PING_INTERVAL_MS = 2000;

/**
 * Parses a single Satellite protocol line into a { command, params } shape.
 * Lines look like: `KEY-STATE DEVICEID=00000 KEY=0 BITMAP=abc...`
 */
function parseLine(line) {
  const [command, ...rest] = line.trim().split(" ");
  const params = {};
  // params may contain quoted values (e.g. PRODUCT_NAME="Satellite Streamdeck")
  const paramRegex = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  const paramsStr = rest.join(" ");
  let match;
  while ((match = paramRegex.exec(paramsStr)) !== null) {
    params[match[1]] = match[2] !== undefined ? match[2] : match[3];
  }
  return { command, params };
}

/**
 * Captures button bitmaps for a known set of locations on a single Companion
 * page by subscribing to each with ADD-SUB, then writing the returned bitmap
 * (requested as png) to disk.
 *
 * This does NOT register a device (no ADD-DEVICE) — it only subscribes to
 * read-only button state, which is the least invasive way to pull images
 * without claiming a surface slot on the target Companion instance.
 *
 * @param {object} opts
 * @param {string} opts.host - Companion host/IP. Required, never guessed.
 * @param {number} [opts.port] - defaults to 16622
 * @param {number} opts.page - Companion page number to capture
 * @param {number} opts.rows - grid rows to subscribe to (0-indexed 0..rows-1)
 * @param {number} opts.cols - grid columns to subscribe to (0-indexed 0..cols-1)
 * @param {string} opts.outDir - directory to write `<row>-<col>.png` files into
 * @param {number} [opts.timeoutMs] - how long to wait for all subs to report state
 */
export async function captureSatellitePage({
  host,
  port = SATELLITE_PORT,
  page,
  rows,
  cols,
  outDir,
  timeoutMs = 10000,
}) {
  if (!host) {
    throw new Error("captureSatellitePage requires an explicit host — never auto-discovered");
  }

  await fs.mkdir(outDir, { recursive: true });

  const pending = new Map(); // subId -> { row, col }
  const received = new Set();
  let socket;
  let pingTimer;
  let buffer = "";

  return new Promise((resolve, reject) => {
    socket = net.createConnection({ host, port }, () => {
      pingTimer = setInterval(() => {
        socket.write("PING keepalive\n");
      }, PING_INTERVAL_MS);
    });

    const finish = (err) => {
      clearInterval(pingTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve({ page, rows, cols, count: received.size });
    };

    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for bitmaps (${received.size}/${pending.size} received)`));
    }, timeoutMs);

    socket.on("data", async (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep any partial line

      for (const line of lines) {
        if (!line.trim()) continue;
        const { command, params } = parseLine(line);

        if (command === "BEGIN") {
          // Handshake received; subscribe to each button location on the page.
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              const subId = `deckdoc-${row}-${col}`;
              pending.set(subId, { row, col });
              socket.write(
                `ADD-SUB SUBID=${subId} LOCATION=${page}/${row}/${col} BITMAP_FORMAT=png\n`
              );
            }
          }
        } else if (command === "SUB-STATE") {
          const subId = params.SUBID;
          const loc = pending.get(subId);
          if (!loc || !params.BITMAP) continue;
          try {
            const dataUrl = params.BITMAP;
            const base64 = dataUrl.startsWith("data:")
              ? dataUrl.slice(dataUrl.indexOf(",") + 1)
              : dataUrl;
            const filePath = path.join(outDir, `${loc.row}-${loc.col}.png`);
            await fs.writeFile(filePath, Buffer.from(base64, "base64"));
            received.add(subId);
          } catch (err) {
            finish(err);
            return;
          }
          if (received.size === pending.size) {
            clearTimeout(timeout);
            finish();
          }
        } else if (command === "PONG") {
          // keepalive ack, nothing to do
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      finish(err);
    });
  });
}
