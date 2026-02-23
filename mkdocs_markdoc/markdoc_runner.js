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
 * Built-in defaults (user config can override any of these):
 *
 *   Nodes
 *     heading — slugified id attribute on every heading for MkDocs TOC
 *     fence   — <pre><code class="language-X"> for highlight.js
 *
 *   Tags
 *     callout  — Material admonition (note/tip/info/warning/danger/success)
 *     comment  — stripped from output entirely
 *     tabs     — Material radio-button tabbed content
 *     tab      — individual tab panel (child of tabs)
 *     badge    — inline coloured chip
 *     details  — native <details>/<summary> collapsible
 *
 *   Functions
 *     upper(s), lower(s), concat(...), default(val, fallback)
 *
 * Usage:
 *   node markdoc_runner.js [--config <path>]
 */

"use strict";

const path = require("path");
const fs = require("fs");
const readline = require("readline");

// ---------------------------------------------------------------------------
// Argument parsing
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
// Startup – load Markdoc and optional user config once
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

const { nodes: defaultNodes, Tag } = Markdoc;

function loadUserConfig(configPath) {
  if (!configPath) return null;
  if (!fs.existsSync(configPath)) {
    throw new Error(`Markdoc config file not found: ${configPath}`);
  }
  const ext = path.extname(configPath).toLowerCase();
  if (ext === ".json") {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
  const mod = require(configPath);
  return mod.default ?? mod;
}

const args = parseArgs(process.argv);
let userConfigSource;
try {
  userConfigSource = loadUserConfig(args.configPath);
} catch (err) {
  process.stderr.write(`mkdocs-markdoc: failed to load config: ${err.message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

function slugify(text) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-");
}

function extractText(children) {
  return (children || [])
    .map((child) => {
      if (typeof child === "string") return child;
      if (Array.isArray(child)) return extractText(child);
      if (child && child.children) return extractText(child.children);
      return "";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Built-in stateless nodes + tags (defined once at module level)
// ---------------------------------------------------------------------------

const builtinFence = {
  ...defaultNodes.fence,
  transform(node, config) {
    const lang = node.attributes.language || "";
    const content = node.attributes.content || "";
    const codeAttrs = lang ? { class: `language-${lang}` } : {};
    return new Tag("pre", {}, [new Tag("code", codeAttrs, [content])]);
  },
};

const comment = {
  children: ["paragraph", "tag", "list", "inline", "text"],
  transform() { return null; },
};

const callout = {
  render: "div",
  children: ["paragraph", "tag", "list", "fence", "inline", "text"],
  attributes: {
    type: {
      type: String,
      default: "note",
      matches: ["note", "tip", "info", "warning", "danger", "success"],
    },
    title: { type: String },
  },
  transform(node, config) {
    const type = node.attributes.type || "note";
    const title = node.attributes.title || capitalize(type);
    const children = node.transformChildren(config);
    return new Tag("div", { class: `admonition ${type}` }, [
      new Tag("p", { class: "admonition-title" }, [title]),
      ...children,
    ]);
  },
};

const tab = {
  render: "div",
  attributes: { label: { type: String, required: true } },
  transform(node, config) {
    return new Tag("div", { class: "tabbed-block" }, node.transformChildren(config));
  },
};

const badge = {
  render: "span",
  inline: true,
  attributes: {
    color: {
      type: String,
      default: "grey",
      matches: ["blue", "green", "red", "orange", "grey", "purple"],
    },
  },
  transform(node, config) {
    const color = node.attributes.color || "grey";
    return new Tag("span", { class: `mkd-badge mkd-badge--${color}` }, node.transformChildren(config));
  },
};

const details = {
  render: "details",
  children: ["paragraph", "tag", "list", "fence", "inline", "text"],
  attributes: {
    summary: { type: String, required: true },
    open: { type: Boolean, default: false },
  },
  transform(node, config) {
    const attrs = { class: "mkd-details" };
    if (node.attributes.open) attrs.open = true;
    return new Tag("details", attrs, [
      new Tag("summary", {}, [node.attributes.summary]),
      ...node.transformChildren(config),
    ]);
  },
};

const builtinFunctions = {
  upper: { transform(p) { return String(p[0]).toUpperCase(); } },
  lower: { transform(p) { return String(p[0]).toLowerCase(); } },
  // In Markdoc 0.5.x parameters arrive as {0: a, 1: b, …}, not an array.
  concat: { transform(p) { return Object.values(p).join(""); } },
  default: { transform(p) { return p[0] != null ? p[0] : p[1]; } },
};

// ---------------------------------------------------------------------------
// Per-render config builder
//
// Called once per page so that stateful transforms get a fresh closure.
// The heading node needs a fresh ID-dedup map each render; the tabs tag needs
// a fresh counter.  If the user config is a factory function it is also called
// here, so user-defined stateful transforms get the same guarantee.
// ---------------------------------------------------------------------------

function buildRenderConfig() {
  // --- stateful built-in heading (fresh seenHeadingIds per render) ---
  const seenHeadingIds = new Map();
  const builtinHeading = {
    ...defaultNodes.heading,
    transform(node, config) {
      const children = node.transformChildren(config);
      const level = node.attributes.level;
      const attrs = {};
      for (const annotation of node.annotations || []) {
        if (annotation.type === "id" || annotation.name === "id") {
          attrs.id = annotation.value;
        } else if (annotation.type === "class" || annotation.name === "class") {
          attrs.class = attrs.class ? `${attrs.class} ${annotation.value}` : annotation.value;
        } else if (annotation.name) {
          attrs[annotation.name] = annotation.value;
        }
      }
      if (!attrs.id) {
        const text = extractText(children);
        const base = slugify(text) || `heading-${level}`;
        const count = seenHeadingIds.get(base) || 0;
        attrs.id = count === 0 ? base : `${base}-${count}`;
        seenHeadingIds.set(base, count + 1);
      }
      return new Tag(`h${level}`, attrs, children);
    },
  };

  // --- stateful built-in tabs (fresh counter per render) ---
  let tabSetCounter = 0;
  const tabs = {
    render: "div",
    attributes: {},
    transform(node, config) {
      const setId = ++tabSetCounter;
      const tabNodes = node.children.filter((c) => c.tag === "tab");
      const labels = tabNodes.map((c) => c.attributes.label || "Tab");
      const inputs = labels.map((_, i) =>
        new Tag("input", {
          type: "radio",
          name: `__tabbed_${setId}`,
          id: `__tabbed_${setId}_${i + 1}`,
          ...(i === 0 ? { checked: true } : {}),
        }, [])
      );
      const labelEls = labels.map((label, i) =>
        new Tag("label", { for: `__tabbed_${setId}_${i + 1}` }, [label])
      );
      return new Tag(
        "div",
        { class: "tabbed-set tabbed-alternate", "data-tabs": `${setId}:${labels.length}` },
        [
          ...inputs,
          new Tag("div", { class: "tabbed-labels" }, labelEls),
          new Tag("div", { class: "tabbed-content" }, node.transformChildren(config)),
        ]
      );
    },
  };

  // --- resolve user config (factory or plain object) ---
  const userConfig =
    typeof userConfigSource === "function"
      ? userConfigSource()
      : userConfigSource || {};

  // User entries take precedence over built-ins throughout.
  return {
    ...userConfig,
    nodes: {
      heading: builtinHeading,
      fence: builtinFence,
      ...(userConfig.nodes || {}),
    },
    tags: {
      comment, callout, tabs, tab, badge, details,
      ...(userConfig.tags || {}),
    },
    functions: {
      ...builtinFunctions,
      ...(userConfig.functions || {}),
    },
    variables: userConfig.variables || {},
  };
}

// ---------------------------------------------------------------------------
// Front matter parser + proxy
//
// parseFrontmatter parses the YAML-like front matter string that Markdoc
// extracts into ast.attributes.frontmatter.  Handles simple key: value pairs
// (strings, numbers, booleans) — the vast majority of MkDocs front matter.
//
// makeFrontmatterProxy wraps the parsed object in a Proxy so that any string
// key access returns null instead of undefined when the key is absent.
// Markdoc's validator uses Object.prototype.hasOwnProperty.call() at every
// path segment, so without the proxy it would error on $frontmatter.author
// whenever the page has no `author:` in its front matter.  The proxy's
// getOwnPropertyDescriptor trap makes hasOwnProperty return true for any
// string key, which suppresses the validation error and lets the reference
// evaluate to null at render time.
// ---------------------------------------------------------------------------

function parseFrontmatter(yaml) {
  if (!yaml || !yaml.trim()) return {};
  const result = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const raw = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (raw === "" || raw === "null") result[key] = null;
    else if (raw === "true") result[key] = true;
    else if (raw === "false") result[key] = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) result[key] = Number(raw);
    else result[key] = raw;
  }
  return result;
}

function makeFrontmatterProxy(data) {
  return new Proxy(data, {
    // Make hasOwnProperty return true for any string key so Markdoc's
    // variable validator doesn't reject $frontmatter.someKey references
    // on pages that don't declare that key in their front matter.
    getOwnPropertyDescriptor(target, key) {
      if (typeof key === "string") {
        const real = Object.getOwnPropertyDescriptor(target, key);
        return real || { configurable: true, enumerable: true, writable: true, value: null };
      }
      return Object.getOwnPropertyDescriptor(target, key);
    },
    get(target, key) {
      if (Object.prototype.hasOwnProperty.call(target, key)) return target[key];
      if (typeof key === "string") return null;
      return undefined;
    },
  });
}

// ---------------------------------------------------------------------------
// Render pipeline
// ---------------------------------------------------------------------------

function renderMarkdoc(source) {
  const markdocConfig = buildRenderConfig();

  const ast = Markdoc.parse(source);

  // Always define $frontmatter.  The proxy makes any key access return null
  // (rather than undefined) on pages that don't declare that key, which
  // suppresses Markdoc's hasOwnProperty-based "variable-undefined" validator.
  const frontmatter = makeFrontmatterProxy(parseFrontmatter(ast.attributes.frontmatter));
  markdocConfig.variables = { ...markdocConfig.variables, frontmatter };

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
// Main loop
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", (line) => {
  if (!line.trim()) return;

  let markdown;
  try {
    ({ markdown } = JSON.parse(line));
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: `Invalid request JSON: ${err.message}` }) + "\n");
    return;
  }

  try {
    const { html, warnings } = renderMarkdoc(markdown);
    process.stdout.write(JSON.stringify({ html, warnings }) + "\n");
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err.message }) + "\n");
  }
});

rl.on("close", () => { process.exit(0); });
