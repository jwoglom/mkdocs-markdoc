# mkdocs-markdoc

An MkDocs plugin that completely replaces the default Python-Markdown renderer
with **[Stripe's Markdoc](https://markdoc.dev)**.  Every `.md` page in your
docs site is parsed and rendered by Markdoc's HTML renderer — no React
required.

---

## How it works

```
MkDocs  ──on_page_markdown──▶  plugin.py  ──stdin──▶  markdoc_runner.js
                                                              │
                         HTML string  ◀──stdout──────────────┘
```

The Python plugin hooks into `on_page_markdown`, pipes the raw Markdown to a
bundled Node.js script via `subprocess`, and returns the HTML string that
MkDocs injects into the theme template.

---

## Prerequisites

| Requirement | Minimum version |
|-------------|----------------|
| Python      | 3.9             |
| MkDocs      | 1.5             |
| Node.js     | 18 LTS          |
| npm         | 8               |

---

## Installation

### 1 — Install the Python package

```bash
# From the repo root (editable/development install)
pip install -e .

# Or once published to PyPI
pip install mkdocs-markdoc
```

### 2 — Install the Node.js Markdoc library

The `@markdoc/markdoc` npm package must be resolvable by Node.js when it runs
the bundled `markdoc_runner.js` script.  Install it in **one** of these
locations (Node's module resolution will find it):

```bash
# Option A – global install (simplest for local dev / CI)
npm install -g @markdoc/markdoc

# Option B – local install in your docs project root
cd /path/to/your/docs-project
npm install @markdoc/markdoc
```

### 3 — Enable the plugin in `mkdocs.yml`

```yaml
# mkdocs.yml
site_name: My Docs

plugins:
  - markdoc          # ← add this; remove or comment out the default 'search'
                     #   plugin only if you no longer need it
```

> **Note:** MkDocs' built-in `search` plugin is independent of the Markdown
> renderer and can be kept alongside `markdoc`:
> ```yaml
> plugins:
>   - search
>   - markdoc
> ```

---

## Configuration options

All options are optional.

```yaml
plugins:
  - markdoc:
      # Path to the Node.js executable.
      # Default: "node"  (resolved via $PATH)
      node_path: /usr/local/bin/node

      # Path to a JS or JSON file that exports a Markdoc config object.
      # When omitted, Markdoc uses its built-in defaults (standard Markdown
      # nodes, no custom tags or functions).
      markdoc_config: docs/markdoc.config.js

      # Milliseconds to wait for the Node subprocess before raising an error.
      # Default: 30000  (30 seconds)
      timeout: 30000
```

### Example `markdoc.config.js`

```js
// docs/markdoc.config.js
const { nodes, Tag } = require("@markdoc/markdoc");

module.exports = {
  tags: {
    callout: {
      render: "div",
      attributes: {
        type: { type: String, default: "note" },
      },
    },
  },
  nodes: {
    // Override the default heading to add anchor IDs
    heading: {
      ...nodes.heading,
      render: "h1",
    },
  },
};
```

---

## Running the docs locally

```bash
mkdocs serve
```

---

## Caveats & trade-offs

* **Markdoc syntax differs from CommonMark.** Markdoc is a superset of
  Markdown, but some edge-cases render differently.  Review the
  [Markdoc syntax reference](https://markdoc.dev/docs/syntax) when migrating
  an existing docs site.
* **Node.js subprocess overhead.** Each page spawns (and immediately exits) one
  Node process.  For large sites with hundreds of pages the build time will
  increase compared to the native Python-Markdown renderer.  If this becomes a
  bottleneck, consider batching pages in a future version.
* **MkDocs extensions are bypassed.** Because we skip Python-Markdown entirely,
  any `markdown_extensions:` listed in `mkdocs.yml` will have no effect.
  Equivalent behaviour must be implemented via Markdoc tags/nodes/functions.
