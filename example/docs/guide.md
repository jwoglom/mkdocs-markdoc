---
title: How It Works
audience: developers
---

# How It Works

## Plugin lifecycle

At build start, `on_config` spawns a **pool of persistent Node.js worker processes** — one per CPU by default. Each worker loads `@markdoc/markdoc` and the optional user config once, then stays alive for the entire build.

Before any page is rendered, `on_env` fans all documentation pages out to the worker pool in parallel using a `ThreadPoolExecutor`. Each worker processes pages through the full Markdoc pipeline and returns HTML over a newline-delimited JSON protocol. Results land in an in-memory cache.

When MkDocs calls `on_page_markdown` for each page, the plugin returns the pre-rendered HTML from the cache — no subprocess overhead at that point.

```
on_config
  └─ spawn N Node.js workers (one per CPU)

on_env  ──── page 1 ──►  worker 1
        ──── page 2 ──►  worker 2      (parallel)
        ──── page 3 ──►  worker 3
        ◄─── HTML 1, 2, 3 ────────────  cache

on_page_markdown  →  cache lookup  →  return HTML
```

{% callout type="info" title="No temp files" %}
The entire exchange is in-memory: stdin/stdout JSON only. No files are written to disk during the build.
{% /callout %}

## Built-in features

The plugin ships everything needed for a fully functional MkDocs-Material site out of the box. No `markdoc.config.js` is required unless you need site-specific variables or custom tags.

### Node overrides

| Node | Behaviour |
|---|---|
| `heading` | Adds a slugified `id` attribute to every heading so MkDocs TOC links work |
| `fence` | Emits `<pre><code class="language-X">` for highlight.js |

### Built-in tags

| Tag | Usage |
|---|---|
| `{% callout type="note" %}` | Material admonition (note / tip / info / warning / danger / success) |
| `{% comment %}` | Stripped entirely — useful for author notes |
| `{% tabs %}` / `{% tab label="…" %}` | Material radio-button tabbed content |
| `{% badge color="blue" %}` | Inline coloured chip |
| `{% details summary="…" %}` | Native `<details>`/`<summary>` collapsible |

### Built-in functions

| Function | Example |
|---|---|
| `upper(s)` | `{% upper($project) %}` → `MKDOCS-MARKDOC` |
| `lower(s)` | `{% lower("Hello") %}` → `hello` |
| `concat(a, b, …)` | `{% concat($project, " v", $version) %}` |
| `default(val, fallback)` | `{% default(null, "n/a") %}` → `n/a` |

### Variables

**Config variables** — define site-wide variables in `markdoc.config.js`:

```js
module.exports = {
  variables: {
    version: "1.0.0",
    project: "my-docs",
  },
};
```

Access them on any page with `{% $version %}`, `{% $project %}`, etc.

**Front matter variables** — each page's YAML front matter is automatically parsed and exposed as `$frontmatter`:

```yaml
---
title: My Page
audience: developers
---
```

Then reference any key on the same page:

```
This page is for \{% $frontmatter.audience %}.
```

For example, this page declares `audience: developers` in its front matter, so `{% $frontmatter.audience %}` renders as: **{% $frontmatter.audience %}**.

## Configuration options

```yaml
plugins:
  - markdoc:
      # Path to the node executable (default: "node" resolved via $PATH)
      node_path: node

      # Path to a .js or .json Markdoc config file (optional)
      markdoc_config: markdoc.config.js

      # Per-page render timeout in milliseconds (default: 30000)
      timeout: 30000

      # Number of parallel Node.js workers; 0 = auto (cpu_count)
      workers: 0
```

## Custom config

A `markdoc.config.js` is only needed if you want to add site-specific variables, define additional tags, or override built-in behaviour.  The file can export either a plain object or a factory function — use a factory when your tags have per-page counter state:

```js
// markdoc.config.js
module.exports = {
  variables: {
    version: "1.0.0",
    repo: "https://github.com/example/my-docs",
  },
};
```

User-defined tags and nodes are **merged on top of the built-ins**, so you can override any built-in or add new ones without losing the defaults.

{% callout type="warning" title="Python-Markdown extensions are bypassed" %}
Because Python-Markdown is skipped entirely, any `markdown_extensions:` in `mkdocs.yml` have **no effect**. Equivalent behaviour must be implemented as Markdoc tags.
{% /callout %}
