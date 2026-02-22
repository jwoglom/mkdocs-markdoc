# Markdoc Component Showcase

Every Markdoc feature in one place: built-in nodes, built-in tags, custom tags, variables, functions, and node annotations.

{% callout type="tip" title="How to read this page" %}
Each section renders the component live and shows the Markdoc source beneath it.
Markdoc parses `{% %}` tags even inside fenced code blocks, so source examples
use a leading backslash (`\{%`) to display them literally without evaluation.
{% /callout %}

---

## 1. Headings

Markdoc supports h1–h6. Below are h3–h6 (h1 and h2 are used for page and section titles):

### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

---

## 2. Inline Formatting

**Bold**, *italic*, ~~strikethrough~~, `inline code`, and a [hyperlink](https://markdoc.dev).

Combined: ***bold-italic***, **`bold code`**, *[italic link](https://markdoc.dev)*.

```
**bold**  *italic*  ~~strikethrough~~  `inline code`  [text](url)
***bold-italic***  **`bold code`**  *[italic link](url)*
```

---

## 3. Lists

**Unordered:**

- Alpha
- Beta
  - Beta-one
  - Beta-two
    - Deep item
- Gamma

**Ordered:**

1. First step
2. Second step
   1. Sub-step A
   2. Sub-step B
3. Third step

```
- Alpha               1. First
- Beta                2. Second
  - Nested               1. Sub-step A
```

---

## 4. Blockquotes

Single level:

> "Markdoc is a powerful, flexible, Markdown-based authoring framework."
> — markdoc.dev

Nested:

> Outer quote.
>
> > Inner quote, one level deep.
> >
> > > Innermost level.

```
> Outer quote.
>
> > Inner quote.
> >
> > > Innermost.
```

---

## 5. Tables

| Left-aligned | Centred | Right-aligned |
|:-------------|:-------:|--------------:|
| Alpha        | A       | 1             |
| Beta         | B       | 22            |
| Gamma        | C       | 333           |

```
| Left-aligned | Centred | Right-aligned |
|:-------------|:-------:|--------------:|
| Alpha        | A       | 1             |
```

---

## 6. Code Fences

Our `fence` node override emits `<pre><code class="language-X">` so highlight.js colours them client-side.

```python
def fibonacci(n: int) -> list[int]:
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result
```

```typescript
interface Plugin {
  name: string;
  transform(markdown: string): Promise<string>;
}
```

```bash
pip install mkdocs mkdocs-material
npm install -g @markdoc/markdoc
mkdocs serve
```

---

## 7. Images

The `image` node renders a standard `<img>` element.

![Placeholder demonstrating the Markdoc image node](images/placeholder.svg)

```
![Alt text](images/placeholder.svg)
```

---

## 8. Horizontal Rules

`---` on its own line produces `<hr>`.

---

## 9. Comments

The `{% comment %}...{% /comment %}` tag renders **nothing** — useful for author notes that should never reach the HTML output.

The line below contains a comment. Inspect the page source and you will not find it:

{% comment %}
This text is completely stripped from the HTML output.
It never appears in the rendered page.
{% /comment %}

```
\{% comment %}
This text is completely stripped from the HTML output.
\{% /comment %}
```

---

## 10. Variables

Variables are defined in `markdoc.config.js` under `variables` and interpolated with `{% $name %}`.

| Expression | Value |
|---|---|
| `{% $project %}` | {% $project %} |
| `{% $version %}` | {% $version %} |
| `{% $stable %}` | {% $stable %} |

```
\{% $project %}   → mkdocs-markdoc
\{% $version %}   → 0.1.0
\{% $stable %}    → true
```

---

## 11. Functions

Functions are defined in `markdoc.config.js` under `functions`.

| Call | Result |
|---|---|
| `upper($project)` | {% upper($project) %} |
| `lower("MkDocs-Material")` | {% lower("MkDocs-Material") %} |
| `concat($project, " v", $version)` | {% concat($project, " v", $version) %} |
| `default(null, "fallback")` | {% default(null, "fallback") %} |

```
\{% upper($project) %}
\{% lower("MkDocs-Material") %}
\{% concat($project, " v", $version) %}
\{% default(null, "fallback") %}
```

---

## 12. Conditionals — `{% if %}` / `{% else / %}`

Evaluates expressions against the variable scope at build time.

{% if $stable %}
**Stable build** — `$stable` is `true`, so this branch renders.
{% else / %}
Development build — hidden because `$stable` is `true`.
{% /if %}

{% if $stable %}{% else / %}This line is hidden — `$stable` is truthy so the else branch is skipped.{% /if %}

> **Note:** Markdoc 0.5.x `{% if %}` only supports bare variable references
> (`{% if $flag %}`). Comparison operators (`==`, `&&`, `||`) produce a
> validation error in the current release and must be implemented via a custom
> function that returns a boolean variable.

```
\{% if $stable %}
Renders when $stable is truthy.
\{% else / %}
Renders when $stable is falsy.
\{% /if %}
```

---

## 13. Node Annotations

Attach HTML attributes to any node by appending `{% #id .class attr=value %}` after the node content.

### Custom ID anchor {% #custom-anchor %}

The heading above has `id="custom-anchor"`. [Jump to it.](#custom-anchor)

Annotation syntax (shown as code, not evaluated — Markdoc parses `{% %}` even inside fences, so annotation examples use inline code):

- Add an id: `{% #my-id %}`
- Add a class: `{% .my-class %}`
- Both: `{% #my-id .my-class %}`

Place the annotation immediately after the node it targets on the same line:
`### My heading {% #anchor-id .extra-class %}`

---

## 14. Callout Tag

Renders as Material `.admonition` markup — the theme CSS handles all styling.

{% callout type="note" %}
A `note` callout — title auto-capitalised when `title` is omitted.
{% /callout %}

{% callout type="tip" title="Custom title" %}
A `tip` with an explicit `title` attribute.
{% /callout %}

{% callout type="info" %}
`info` level.
{% /callout %}

{% callout type="warning" %}
`warning` level.
{% /callout %}

{% callout type="danger" title="Breaking change" %}
`danger` — use for destructive or irreversible actions.
{% /callout %}

{% callout type="success" title="Build passed" %}
`success` — use for confirmations and positive outcomes.
{% /callout %}

Callouts accept full block content:

{% callout type="tip" title="Callout with rich content" %}
Lists work:

- **Bold item** with `inline code`
- [A link](https://markdoc.dev) inside a callout

Code blocks work too:

```python
print("hello from inside a callout")
```
{% /callout %}

```
\{% callout type="tip" title="Custom title" %}
Content with **bold** and `code`.
\{% /callout %}
```

---

## 15. Tabs Tag

Generates Material's radio-button tab structure — the theme's CSS and JS drive the switching interaction.

{% tabs %}
{% tab label="Python" %}
```python
result = subprocess.run(
    ["node", "markdoc_runner.js"],
    input=markdown,
    capture_output=True,
    text=True,
)
html = result.stdout
```
{% /tab %}
{% tab label="JavaScript" %}
```js
const ast = Markdoc.parse(source);
const tree = Markdoc.transform(ast, config);
const html = Markdoc.renderers.html(tree);
process.stdout.write(html);
```
{% /tab %}
{% tab label="YAML" %}
```yaml
plugins:
  - markdoc:
      node_path: node
      markdoc_config: markdoc.config.js
      timeout: 30000
```
{% /tab %}
{% /tabs %}

```
\{% tabs %}
\{% tab label="Python" %}
...content...
\{% /tab %}
\{% tab label="JavaScript" %}
...content...
\{% /tab %}
\{% /tabs %}
```

---

## 16. Badge Tag (inline)

{% badge color="blue" %}NEW{% /badge %} {% badge color="green" %}STABLE{% /badge %} {% badge color="orange" %}BETA{% /badge %} {% badge color="red" %}DEPRECATED{% /badge %} {% badge color="purple" %}EXPERIMENTAL{% /badge %} {% badge color="grey" %}DRAFT{% /badge %}

Badges compose inside sentences: version {% badge color="green" %}{% $version %}{% /badge %} is the current release.

Inside a table:

| Feature | Status |
|---|---|
| `callout` | {% badge color="green" %}stable{% /badge %} |
| `tabs` / `tab` | {% badge color="green" %}stable{% /badge %} |
| `badge` | {% badge color="blue" %}new{% /badge %} |
| `details` | {% badge color="blue" %}new{% /badge %} |
| `comment` | {% badge color="blue" %}new{% /badge %} |

Syntax (inline code — not evaluated, since badge must appear inside a paragraph):

- Standalone row: `{% badge color="blue" %}NEW{% /badge %} {% badge color="green" %}OK{% /badge %}`
- Inside text: `Version {% badge color="green" %}0.1.0{% /badge %} is current.`
- In a table cell: `| Feature | {% badge color="blue" %}new{% /badge %} |`

---

## 17. Details Tag (collapsible)

Uses the native HTML `<details>`/`<summary>` — no JavaScript required.

{% details summary="Show implementation notes" %}
The `details` tag renders a native `<details>`/`<summary>` pair:

```js
return new Tag("details", { class: "mkd-details" }, [
  new Tag("summary", {}, [summary]),
  ...children,
]);
```

Lists and nested content work inside:

- Browser handles expand/collapse natively
- Styled to match Material's admonition look
{% /details %}

{% details summary="Already expanded (open=true)" open=true %}
This section starts **open** because `open=true` was set.
It still toggles on click.
{% /details %}

```
\{% details summary="Show implementation notes" %}
Hidden content here.
\{% /details %}

\{% details summary="Already expanded" open=true %}
Starts open.
\{% /details %}
```
