---
title: dpx_deckDoc
layout: default
---

<div align="center">
  <img src="images/logo.png" alt="dpx_deckDoc" height="64"><br>
  <strong>Auto-generated documentation for Bitfocus Companion control-surface setups.</strong><br>
  <a href="demo/">Try the live demo</a> ·
  <a href="https://github.com/dubpixel/dpx_deckDoc">Source on GitHub</a> ·
  <a href="https://github.com/dubpixel/dpx_deckDoc/issues">Report an issue</a>
</div>

---

## What is this?

If you run [Bitfocus Companion](https://bitfocus.io/companion) to drive a Stream Deck (or any
StreamDeck-style panel) for a show, a real rig can end up with dozens of pages and hundreds of
buttons wired to OSC, MIDI, ATEM, vMix, QLab, disguise, and everything else Companion talks to.
None of that is obvious to someone who didn't build it.

**dpx_deckDoc turns a live Companion instance into a browsable, editable reference site**: a real
picture of every button, what it actually does, and a place to write that down — without hand-
screenshotting anything.

**[Open the demo →](demo/)** to see the output on a fake rig before installing anything.

---

## Quickstart

You don't need to learn the whole tool to get a first result. Three commands, in order:

```bash
git clone https://github.com/dubpixel/dpx_deckDoc.git
cd dpx_deckDoc
npm install
```

```bash
node src/cli.js scrape --host 10.0.0.5 --device my-rig
```
Replace `10.0.0.5` with the IP of the Companion instance you want to document, and `my-rig` with
whatever short name you want to call it. This is the only command that talks to Companion — it
pulls the config export, walks every page, and captures every button's real rendered image, all
in one shot. Nothing on the Companion side is changed; this only reads.

```bash
node src/cli.js serve --out devices
```
Open [http://localhost:4321](http://localhost:4321). Every button from your scrape is already
labeled with what it's wired to. Click any button to add a plain-English write-up. When you're
happy with it, click **Export Site** in the header — that freezes everything into a self-contained
folder you can hand to someone else, no server or install required to view it.

That's the whole loop: **scrape once, write notes in the browser, export when done.**

---

## The three commands, in plain terms

| Command | What it's for | When you'd run it |
|---|---|---|
| `scrape` | Capture a Companion instance | Once per rig, and again any time the button layout changes |
| `serve` | The editor you write notes in | Whenever you're actively documenting |
| `build` | Freeze one device to a static site | When you're done and want to hand it off (also available as the "Export Site" button inside `serve`, so you rarely need to run this by hand) |

Full flags:

```bash
node src/cli.js scrape --host <companion-ip> --device <name> [--out devices]
node src/cli.js serve --out devices
node src/cli.js build --out devices/<name>
```

Each Companion instance you scrape becomes its own **device** under `devices/<name>/` — you can
scrape as many rigs as you want and switch between them in the editor's device switcher. You can
also add a new device straight from the browser via **+ New Device** in `serve`, without touching
the command line again after the first install.

---

## Annotation fields

Each button's write-up is a few structured fields, not one big text box:

| Field | Where it comes from | Rendered as |
|---|---|---|
| **Heading** | You write it | Bold title |
| **Body** | You write it | Plain paragraph |
| **Notice** | You write it | Red — for "don't do this unless..." warnings |
| **Note** | You write it | Italic — a quieter aside |
| **Command** | Auto-filled from the Companion config export | Raw connection/action reference, e.g. `OSC: /cue/12/start` |
| **Label override** | You write it, optional | Replaces the on-image text with a fixed label, shown as an overlay |

`scrape` pre-fills **Command** for every button from the real config export — it never invents
text, and it never overwrites something you've already hand-written. **Body**, **Notice**, **Note**,
and **Label override** always start empty and are entirely yours.

---

## Managing pages and devices

- **Manage Pages** (in `serve`) lets you include/exclude specific pages from the exported site —
  useful for hiding internal test pages from a handoff doc.
- Each device card in the switcher shows the real host:port it was scraped from and when, so you
  can tell rigs apart at a glance.
- Devices can be removed from the editor with the **×** on their card.

---

## Requirements

- Node.js (no other runtime dependencies to install anything — `npm install` pulls in
  [Playwright](https://playwright.dev/), used only during `scrape` to read real button bitmaps out
  of Companion's own tablet web UI)
- A Companion instance reachable over HTTP (its normal web UI port, usually `8000`)

## Testing the tool itself

```bash
npm test
```

Runs the project's own regression suite (Node's built-in test runner, no extra dependencies).

---

<div align="center">
<sub>built by <a href="https://dubpixel.tv">dubpixel</a> · <a href="https://github.com/dubpixel/dpx_deckDoc">dubpixel/dpx_deckDoc</a></sub>
</div>
