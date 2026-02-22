#!/usr/bin/env node
/**
 * markdoc_runner.js
 *
 * Persistent Node.js process that renders Markdoc pages for the MkDocs plugin.
 *
 * Protocol (newline-delimited JSON over stdin/stdout):
 *   Request  → {"markdown": "..."}
 *   Response → {"html": "...", "warnings": [...]}
 *             | {"error": "..."}
 *
 * The process stays alive until stdin is closed, amortising Node.js startup
 * and @markdoc/markdoc module load cost across all pages in the build.
 *
 * Usage:
 *   node markdoc_runner.js [--config <path>]
 */

"use strict";

const path = require("path");
const fs = require("fs");
const readline = require("readline");

// ---------------------------------------------------------------------------
// Argument parsing  (minimal – only --config <path> is supported)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { configPath: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--config" && argv[i + 1]) {
      args.configPath = path.resolve(argv[++i]);
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Load optional Markdoc config
// ---------------------------------------------------------------------------

function loadMarkdocConfig(configPath) {
  if (!configPath) return {};

  if (!fs.existsSync(configPath)) {
    throw new Error(`Markdoc config file not found: ${configPath}`);
  }

  const ext = path.extname(configPath).toLowerCase();

  if (ext === ".json") {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  // Treat .js / .cjs as a CommonJS module exporting a config object.
  const mod = require(configPath);
  return mod.default ?? mod;
}

// ---------------------------------------------------------------------------
// Startup – load Markdoc and config once for the lifetime of the process
// ---------------------------------------------------------------------------

let Markdoc;
try {
  Markdoc = require("@markdoc/markdoc");
} catch (err) {
  process.stderr.write(
    "@markdoc/markdoc is not installed. " +
      "Run `npm install @markdoc/markdoc` in the plugin directory or globally.\n" +
      err.message + "\n"
  );
  process.exit(1);
}

const args = parseArgs(process.argv);
let markdocConfig;
try {
  markdocConfig = loadMarkdocConfig(args.configPath);
} catch (err) {
  process.stderr.write(`mkdocs-markdoc: failed to load config: ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

function renderMarkdoc(source) {
  // Reset per-page state (heading ID dedup counter, tab set counter, etc.)
  // if the config exports a resetState() helper.
  if (typeof markdocConfig.resetState === "function") {
    markdocConfig.resetState();
  }

  const ast = Markdoc.parse(source);

  // Collect warnings; only hard-fail on error-level issues.
  const errors = Markdoc.validate(ast, markdocConfig);
  const warnings = [];
  if (errors.length > 0) {
    const fatal = [];
    for (const e of errors) {
      const msg = `[${e.error.level}] ${e.error.message} (line ${e.lines?.[0] ?? "?"})`;
      if (e.error.level === "error") {
        fatal.push(msg);
      } else {
        warnings.push(msg);
      }
    }
    if (fatal.length > 0) {
      throw new Error(`Markdoc validation errors:\n${fatal.join("\n")}`);
    }
  }

  const renderableTree = Markdoc.transform(ast, markdocConfig);
  const html = Markdoc.renderers.html(renderableTree);
  return { html, warnings };
}

// ---------------------------------------------------------------------------
// Main loop – read one JSON line per request, write one JSON line per response
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  if (!line.trim()) return;

  let markdown;
  try {
    ({ markdown } = JSON.parse(line));
  } catch (err) {
    process.stdout.write(
      JSON.stringify({ error: `Invalid request JSON: ${err.message}` }) + "\n"
    );
    return;
  }

  try {
    const { html, warnings } = renderMarkdoc(markdown);
    process.stdout.write(JSON.stringify({ html, warnings }) + "\n");
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + "\n");
  }
});

rl.on("close", () => {
  process.exit(0);
});
