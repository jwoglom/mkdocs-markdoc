# Welcome to mkdocs-markdoc

This site is rendered entirely by **[Stripe's Markdoc](https://markdoc.dev)** — Python-Markdown is bypassed completely. Every `.md` file is piped through a Node.js subprocess that runs `Markdoc.parse()` → `Markdoc.transform()` → `Markdoc.renderers.html()`.

{% callout type="tip" title="What you're looking at" %}
You're reading a page that was **never touched by Python-Markdown**. Headings, paragraphs, tables, code blocks, and custom tags are all produced by Markdoc's HTML renderer.
{% /callout %}

## How the pipeline works

```
mkdocs.yml
    │
    └─ on_page_markdown event
            │
            ▼
    plugin.py  (Python)
    │  stdin ──► markdoc_runner.js  (Node.js)
    │               ├─ Markdoc.parse()
    │               ├─ Markdoc.transform()
    │               └─ Markdoc.renderers.html()
    ◄── stdout ─────────────────────────────────
            │
            ▼
    MkDocs injects HTML into theme template
```

## Quick comparison

| Feature | Python-Markdown | Markdoc |
|---|---|---|
| Parser | Python | Node.js |
| Custom syntax | Extensions | Tags & nodes |
| Strict validation | No | Yes (schema-based) |
| React required | No | No (`renderers.html`) |
| Admonitions | `!!! note` | `{% callout %}` |

## Standard Markdown

All CommonMark constructs render correctly through Markdoc:

- **Bold**, *italic*, ~~strikethrough~~, `inline code`
- [External links](https://markdoc.dev) and [internal links](guide.md)
- Nested lists:
  - Level 2
    - Level 3

> Blockquotes work too. Markdoc is a superset of Markdown, so existing content largely works as-is.

Navigate to the **Guide** tab to learn more.
