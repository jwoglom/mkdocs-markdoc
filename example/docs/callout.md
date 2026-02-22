# Callouts & Tags

All custom tags on this page are rendered by Markdoc and styled by Material's existing CSS — no extra JavaScript needed.

## Callout types

The `{% callout %}` tag maps to Material's admonition markup, so all built-in admonition styles work out of the box.

{% callout type="note" %}
A **note** is neutral information the reader might find useful.
{% /callout %}

{% callout type="tip" title="Pro tip" %}
Use `title="..."` to override the auto-capitalised heading.
{% /callout %}

{% callout type="info" title="Did you know?" %}
Markdoc's `validate()` step runs *before* `transform()`, surfacing schema errors with line numbers during the MkDocs build — not silently at runtime.
{% /callout %}

{% callout type="warning" %}
Markdoc syntax is a superset of Markdown, but edge cases differ. Test pages carefully when migrating an existing site.
{% /callout %}

{% callout type="danger" title="Breaking change" %}
Enabling this plugin **completely replaces** Python-Markdown. Any `markdown_extensions` in `mkdocs.yml` will be ignored.
{% /callout %}

{% callout type="success" title="Build confirmed" %}
If you can read this, the Markdoc → Material pipeline is working end-to-end.
{% /callout %}

## Nested content in callouts

Callouts can contain any block-level Markdown content:

{% callout type="tip" title="Callout with rich content" %}
Lists work inside callouts:

- First item with **bold**
- Second item with `code`
- Third item with [a link](https://markdoc.dev)

So do code blocks:

```bash
echo "Hello from inside a callout"
```
{% /callout %}

## Escaped tags

To print a literal tag without rendering it, prefix with a backslash:

\{% callout type="note" %} — this is not rendered as a callout.
