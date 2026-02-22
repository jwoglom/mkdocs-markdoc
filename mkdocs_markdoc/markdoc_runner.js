#!/usr/bin/env node
/**
 * markdoc_runner.js
 *
 * Reads raw Markdown from stdin, renders it to HTML with @markdoc/markdoc,
 * and writes the HTML to stdout.
 *
 * Usage (invoked by the Python plugin):
 *   echo "# Hello" | node markdoc_runner.js [--config <path>]
 *
 * Exit codes:
 *   0  success – HTML written to stdout
 *   1  error   – message written to stderr
 */

"use strict";

const path = require("path");
const fs = require("fs");

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
  // The module may export the config directly or as `module.exports.default`.
  const mod = require(configPath);
  return mod.default ?? mod;
}

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

function renderMarkdoc(source, markdocConfig) {
  // Lazy-require so a missing package produces a clear error message.
  let Markdoc;
  try {
    Markdoc = require("@markdoc/markdoc");
  } catch (err) {
    throw new Error(
      "@markdoc/markdoc is not installed. " +
        "Run `npm install @markdoc/markdoc` in the plugin directory or globally.\n" +
        err.message
    );
  }

  // 1. Parse – produces an AST.
  const ast = Markdoc.parse(source);

  // 2. Validate – surface any Markdoc schema errors before transforming.
  const errors = Markdoc.validate(ast, markdocConfig);
  if (errors.length > 0) {
    const messages = errors
      .map((e) => `  [${e.error.level}] ${e.error.message} (line ${e.lines?.[0] ?? "?"})`)
      .join("\n");

    // Only hard-fail on actual errors; warnings/hints are logged to stderr.
    const fatal = errors.filter((e) => e.error.level === "error");
    if (fatal.length > 0) {
      throw new Error(`Markdoc validation errors:\n${messages}`);
    }

    process.stderr.write(`mkdocs-markdoc: Markdoc warnings:\n${messages}\n`);
  }

  // 3. Transform – converts AST to a renderable tree using the config.
  const renderableTree = Markdoc.transform(ast, markdocConfig);

  // 4. Render to plain HTML (no React dependency).
  return Markdoc.renderers.html(renderableTree);
}

// ---------------------------------------------------------------------------
// Main – read stdin, render, write stdout
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);

  let markdocConfig;
  try {
    markdocConfig = loadMarkdocConfig(args.configPath);
  } catch (err) {
    process.stderr.write(`mkdocs-markdoc: failed to load config: ${err.message}\n`);
    process.exit(1);
  }

  // Collect stdin into a single string.
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const source = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");

  let html;
  try {
    html = renderMarkdoc(source, markdocConfig);
  } catch (err) {
    process.stderr.write(`mkdocs-markdoc: render error: ${err.message}\n`);
    process.exit(1);
  }

  process.stdout.write(html);
}

main().catch((err) => {
  process.stderr.write(`mkdocs-markdoc: unexpected error: ${err.message}\n`);
  process.exit(1);
});
