/**
 * markdoc.config.js
 *
 * Markdoc configuration for the MkDocs-Material test site.
 *
 * Node overrides  : fence  →  <pre><code class="language-X"> for highlight.js
 * Custom tags     : callout, comment, tabs/tab, badge (inline), details
 * Variables       : $version, $project, $stable
 * Functions       : upper(), lower(), concat(), default()
 *
 * Note on code-fence examples in docs
 * ------------------------------------
 * Markdoc parses {% %} tags everywhere — including inside fenced code blocks.
 * To show Markdoc tag syntax literally inside a fence, prefix with a backslash:
 *   \{% callout %} → renders as {% callout %} in the output
 * The tag still needs to be defined in this config for validation to pass.
 */

"use strict";

const { nodes: defaultNodes, Tag } = require("@markdoc/markdoc");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function capitalize(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

// Incremented per {% tabs %} block so every radio input gets a unique id.
let tabSetCounter = 0;

// Counter map for heading ID deduplication (resets each page — Node spawns fresh).
const seenHeadingIds = new Map();

/**
 * slugify — matches Python-Markdown toc extension so IDs are consistent with
 * what MkDocs would produce if it were rendering headings itself.
 */
function slugify(text) {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-");
}

/** Recursively pull plain text out of a Markdoc renderable-tree subtree. */
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
// Node overrides
// ---------------------------------------------------------------------------

/**
 * heading — add a unique id to every heading so the browser can scroll to it
 * from TOC links.  Honours explicit {% #custom-id %} annotations.
 */
const heading = {
  ...defaultNodes.heading,
  transform(node, config) {
    const children = node.transformChildren(config);
    const level = node.attributes.level;

    // Collect HTML attributes from Markdoc annotations ({% #id .class k=v %})
    const attrs = {};
    for (const annotation of node.annotations || []) {
      if (annotation.type === "id" || annotation.name === "id") {
        attrs.id = annotation.value;
      } else if (annotation.type === "class" || annotation.name === "class") {
        attrs.class = attrs.class
          ? `${attrs.class} ${annotation.value}`
          : annotation.value;
      } else if (annotation.name) {
        attrs[annotation.name] = annotation.value;
      }
    }

    // Auto-generate id from heading text when no explicit annotation was given
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

/**
 * fence — override default output to <pre><code class="language-X"> so that
 * highlight.js can detect and colour the block client-side.
 */
const fence = {
  ...defaultNodes.fence,
  transform(node, config) {
    const lang = node.attributes.language || "";
    const content = node.attributes.content || "";
    const codeAttrs = lang ? { class: `language-${lang}` } : {};
    return new Tag("pre", {}, [new Tag("code", codeAttrs, [content])]);
  },
};

// ---------------------------------------------------------------------------
// Custom tags
// ---------------------------------------------------------------------------

/**
 * {% comment %}Hidden text{% /comment %}
 * Produces no HTML output — useful for author notes inside Markdoc source.
 */
const comment = {
  children: ["paragraph", "tag", "list", "inline", "text"],
  transform() {
    return null;
  },
};

/**
 * {% callout type="note|tip|info|warning|danger|success" title="..." %}
 * Content here.
 * {% /callout %}
 *
 * Renders as a Material admonition <div>; the theme CSS handles styling.
 */
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

/**
 * {% tabs %}
 *   {% tab label="First" %}...{% /tab %}
 *   {% tab label="Second" %}...{% /tab %}
 * {% /tabs %}
 *
 * Generates the full Material radio-button tab structure so the theme's built-in
 * CSS and JS handle switching — no extra JavaScript needed on our side.
 */
const tabs = {
  render: "div",
  attributes: {},
  transform(node, config) {
    const setId = ++tabSetCounter;

    // Extract labels from raw AST children BEFORE transforming so we can
    // build the radio <input> / <label> pairs that Material's CSS requires.
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

    const contentBlocks = node.transformChildren(config);

    return new Tag(
      "div",
      { class: "tabbed-set tabbed-alternate", "data-tabs": `${setId}:${labels.length}` },
      [
        ...inputs,
        new Tag("div", { class: "tabbed-labels" }, labelEls),
        new Tag("div", { class: "tabbed-content" }, contentBlocks),
      ]
    );
  },
};

const tab = {
  render: "div",
  attributes: {
    label: { type: String, required: true },
  },
  transform(node, config) {
    return new Tag("div", { class: "tabbed-block" }, node.transformChildren(config));
  },
};

/**
 * Inline badge / chip.
 * {% badge color="blue|green|red|orange|grey|purple" %}Label{% /badge %}
 *
 * Must be used inline (inside a paragraph, table cell, etc.), not as a
 * standalone block on its own line.
 */
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
    return new Tag(
      "span",
      { class: `mkd-badge mkd-badge--${color}` },
      node.transformChildren(config)
    );
  },
};

/**
 * Collapsible section using the native HTML <details>/<summary> elements.
 * {% details summary="Click to expand" open=false %}
 * Content revealed on click.
 * {% /details %}
 */
const details = {
  render: "details",
  children: ["paragraph", "tag", "list", "fence", "inline", "text"],
  attributes: {
    summary: { type: String, required: true },
    open: { type: Boolean, default: false },
  },
  transform(node, config) {
    const summary = node.attributes.summary;
    const open = node.attributes.open;
    const children = node.transformChildren(config);
    const attrs = { class: "mkd-details" };
    if (open) attrs.open = true;
    return new Tag("details", attrs, [
      new Tag("summary", {}, [summary]),
      ...children,
    ]);
  },
};

// ---------------------------------------------------------------------------
// Variables  (accessible as {% $name %} on any page)
// ---------------------------------------------------------------------------

const variables = {
  version: "0.1.0",
  project: "mkdocs-markdoc",
  stable: true,
};

// ---------------------------------------------------------------------------
// Functions  (callable as {% fnName(args) %} on any page)
// ---------------------------------------------------------------------------

const functions = {
  upper: {
    transform(parameters) {
      return String(parameters[0]).toUpperCase();
    },
  },
  lower: {
    transform(parameters) {
      return String(parameters[0]).toLowerCase();
    },
  },
  concat: {
    // In Markdoc 0.5.x parameters arrive as {0: a, 1: b, …}, not an array.
    transform(parameters) {
      return Object.values(parameters).join("");
    },
  },
  default: {
    transform(parameters) {
      return parameters[0] != null ? parameters[0] : parameters[1];
    },
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  nodes: { fence, heading },
  tags: { comment, callout, tabs, tab, badge, details },
  variables,
  functions,
};
