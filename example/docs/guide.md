# How It Works

## Plugin lifecycle

MkDocs calls `on_page_markdown` once per page, passing the raw Markdown string. The plugin:

1. Pipes the string to `markdoc_runner.js` via `subprocess.run(..., input=markdown)`.
2. The Node script runs the full Markdoc pipeline and writes HTML to `stdout`.
3. The plugin returns that HTML string — MkDocs injects it into the theme.

{% callout type="info" title="No temp files" %}
The entire exchange is in-memory: stdin/stdout only. No files are written to disk during the build.
{% /callout %}

## Configuration options

```yaml
plugins:
  - markdoc:
      # Path to the node executable (default: "node" resolved via $PATH)
      node_path: node

      # Path to a .js or .json Markdoc config file (optional)
      markdoc_config: markdoc.config.js

      # Subprocess timeout in milliseconds (default: 30000)
      timeout: 30000
```

## Custom Markdoc config

The `markdoc.config.js` in this test project does three things:

### 1 — Override the `fence` node

Markdoc's default fence renderer outputs `<pre data-language="X">`. Our override produces `<pre><code class="language-X">` instead, which is what **highlight.js** expects:

```js
const fence = {
  ...defaultNodes.fence,
  transform(node, config) {
    const lang = node.attributes.language || "";
    const content = node.attributes.content || "";
    const codeAttrs = lang ? { class: `language-${lang}` } : {};
    return new Tag("pre", {}, [new Tag("code", codeAttrs, [content])]);
  },
};
```

### 2 — Define the `callout` tag

Maps to Material's admonition HTML so the theme CSS styles it automatically:

```js
const callout = {
  transform(node, config) {
    const type = node.attributes.type || "note";
    const title = node.attributes.title || capitalize(type);
    return new Tag("div", { class: `admonition ${type}` }, [
      new Tag("p", { class: "admonition-title" }, [title]),
      ...node.transformChildren(config),
    ]);
  },
};
```

### 3 — Define `tabs` / `tab` tags

Render Material's `.tabbed-set` markup so the theme's built-in tab JS works.

{% callout type="warning" title="MkDocs extensions are bypassed" %}
Because Python-Markdown is skipped entirely, any `markdown_extensions:` in `mkdocs.yml` have **no effect**. Equivalent behaviour must be implemented as Markdoc tags in your `markdoc.config.js`.
{% /callout %}
