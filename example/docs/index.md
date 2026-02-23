# Welcome to mkdocs-markdoc

This site is rendered entirely by **[Stripe's Markdoc](https://markdoc.dev)** — Python-Markdown is bypassed completely. A pool of persistent Node.js workers processes all pages in parallel, each running `Markdoc.parse()` → `Markdoc.transform()` → `Markdoc.renderers.html()`.

{% callout type="tip" title="What you're looking at" %}
You're reading a page that was **never touched by Python-Markdown**. Headings, paragraphs, tables, code blocks, and custom tags are all produced by Markdoc's HTML renderer.
{% /callout %}

## How the pipeline works

```
on_config  →  spawn N persistent Node.js workers

on_env     →  read all pages, fan out to worker pool (parallel)
                 worker 1: parse → transform → html
                 worker 2: parse → transform → html
                 ...
           →  cache results

on_page_markdown  →  cache lookup  →  return HTML to MkDocs
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
