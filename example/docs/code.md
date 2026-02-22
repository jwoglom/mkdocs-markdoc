# Code Blocks

Syntax highlighting is handled client-side by **highlight.js** (loaded via `hljs-init.js`), because Pygments is never invoked when Python-Markdown is bypassed.

The `fence` node in `markdoc.config.js` overrides Markdoc's default output to produce `<pre><code class="language-X">` — the exact markup highlight.js expects.

## Python

```python
from pathlib import Path
import subprocess

def render_markdoc(markdown: str, runner: Path) -> str:
    result = subprocess.run(
        ["node", str(runner)],
        input=markdown,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    return result.stdout
```

## JavaScript

```js
const Markdoc = require("@markdoc/markdoc");

function render(source, config = {}) {
  const ast = Markdoc.parse(source);
  const errors = Markdoc.validate(ast, config);

  if (errors.some((e) => e.error.level === "error")) {
    throw new Error(errors.map((e) => e.error.message).join("\n"));
  }

  const tree = Markdoc.transform(ast, config);
  return Markdoc.renderers.html(tree);
}
```

## YAML

```yaml
plugins:
  - search
  - markdoc:
      node_path: node
      markdoc_config: markdoc.config.js
      timeout: 30000
```

## Bash

```bash
# Install dependencies
pip install mkdocs mkdocs-material
pip install -e /path/to/mkdocs-markdoc
npm install -g @markdoc/markdoc

# Serve locally
cd test && mkdocs serve
```

## Plain block (no language)

```
This block has no language annotation.
highlight.js will auto-detect or leave it unstyled.
```

{% callout type="info" title="Syntax highlighting scope" %}
highlight.js includes autodetection for 190+ languages. Only the most common ones are in the default bundle loaded from CDN. Add `loadLanguages(["rust", "haskell"])` calls to `hljs-init.js` if you need less-common languages.
{% /callout %}
