"""
MkDocs plugin that replaces the default Python-Markdown renderer with
Stripe's Markdoc, via a bundled Node.js subprocess.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from mkdocs.config import config_options
from mkdocs.config.base import Config
from mkdocs.plugins import BasePlugin
from mkdocs.structure.pages import Page
from mkdocs.structure.toc import AnchorLink, TableOfContents

log = logging.getLogger("mkdocs.plugins.markdoc")

# Absolute path to the bundled Node.js runner so it works regardless of cwd.
_RUNNER_PATH = Path(__file__).parent / "markdoc_runner.js"

_HEADING_TAGS = frozenset({"h1", "h2", "h3", "h4", "h5", "h6"})


class _HeadingParser(HTMLParser):
    """Extract heading text + existing id attributes from rendered HTML."""

    def __init__(self) -> None:
        super().__init__()
        self.headings: list[dict] = []
        self._tag: str = ""
        self._id: str = ""
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in _HEADING_TAGS:
            self._tag = tag
            self._id = dict(attrs).get("id", "")
            self._text = []

    def handle_endtag(self, tag: str) -> None:
        if tag == self._tag and tag in _HEADING_TAGS:
            self.headings.append({
                "level": int(self._tag[1]),
                "id": self._id,
                "text": "".join(self._text).strip(),
            })
            self._tag = ""

    def handle_data(self, data: str) -> None:
        if self._tag:
            self._text.append(data)


def _toc_from_html(html: str) -> TableOfContents:
    """
    Build a MkDocs TableOfContents from <hN id="..."> elements in the HTML.

    The heading node override in markdoc.config.js guarantees every heading
    already carries an id attribute, so no HTML modification is needed here.
    Headings without an id (e.g. those inside custom tag blocks that swallow
    them) are silently skipped.
    """
    parser = _HeadingParser()
    parser.feed(html)

    top: list[AnchorLink] = []
    stack: list[AnchorLink] = []

    for h in parser.headings:
        if not h["id"]:
            continue
        link = AnchorLink(title=h["text"], id=h["id"], level=h["level"])
        while stack and stack[-1].level >= h["level"]:
            stack.pop()
        if stack:
            stack[-1].children.append(link)
        else:
            top.append(link)
        stack.append(link)

    return TableOfContents(top)


class MarkdocPluginConfig(Config):
    # Path to the `node` executable. Defaults to whatever is on $PATH.
    node_path = config_options.Type(str, default="node")

    # Optional: path to a Markdoc config JS/JSON file that the runner will
    # `require()`. When empty the runner uses bare Markdoc defaults.
    markdoc_config = config_options.Optional(config_options.File(exists=True))

    # Milliseconds before the Node subprocess is killed and an error raised.
    timeout = config_options.Type(int, default=30_000)


class MarkdocPlugin(BasePlugin[MarkdocPluginConfig]):
    """
    Intercepts raw Markdown on every page and hands it to the Node.js Markdoc
    runner.  The runner returns a plain HTML string that MkDocs then injects
    into its theme template exactly as it would with the normal renderer.

    Lifecycle
    ---------
    on_config  – validate that Node.js is available once, up front.
    on_page_markdown – convert each page's Markdown to HTML via subprocess.
    """

    def on_config(self, config: dict[str, Any]) -> dict[str, Any]:
        node_exec = self.config["node_path"]

        # Resolve "node" to a full path so the error message is unambiguous.
        resolved = shutil.which(node_exec)
        if resolved is None:
            raise RuntimeError(
                f"mkdocs-markdoc: Node.js executable '{node_exec}' not found. "
                "Install Node.js (https://nodejs.org) or set the `node_path` "
                "option in your mkdocs.yml plugin configuration."
            )

        self._node_exec = resolved
        log.debug("mkdocs-markdoc: using Node.js at %s", resolved)

        # Verify @markdoc/markdoc is installed where the runner can reach it.
        check = self._run_node(
            "require('@markdoc/markdoc'); process.stdout.write('ok');"
        )
        if check.returncode != 0 or check.stdout.strip() != "ok":
            stderr = check.stderr.strip()
            raise RuntimeError(
                "mkdocs-markdoc: @markdoc/markdoc is not importable from the "
                "Node.js runner.  Run `npm install @markdoc/markdoc` (globally "
                f"or in the project directory).\nNode stderr: {stderr}"
            )

        return config

    # ------------------------------------------------------------------
    # Core hook
    # ------------------------------------------------------------------

    def on_page_markdown(
        self,
        markdown: str,
        page: Page,
        config: dict[str, Any],
        **kwargs: Any,
    ) -> str:
        """
        Called by MkDocs with the raw Markdown string for every page.
        Returns the rendered HTML string.
        """
        try:
            result = self._run_node_runner(markdown)
        except FileNotFoundError:
            # Node executable disappeared between on_config and now.
            raise RuntimeError(
                f"mkdocs-markdoc: Node.js executable '{self._node_exec}' "
                "disappeared during the build."
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError(
                f"mkdocs-markdoc: Node.js subprocess timed out after "
                f"{self.config['timeout']} ms while processing "
                f"'{page.file.src_path}'."
            )

        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(
                f"mkdocs-markdoc: Markdoc rendering failed for "
                f"'{page.file.src_path}'.\nNode stderr: {stderr}"
            )

        html = result.stdout
        if not html:
            log.warning(
                "mkdocs-markdoc: empty HTML output for '%s' – "
                "returning empty string.",
                page.file.src_path,
            )

        return html

    def on_page_content(
        self,
        html: str,
        page: Page,
        config: dict[str, Any],
        **kwargs: Any,
    ) -> str:
        """
        Called by MkDocs after Python-Markdown has processed the page.

        Because we bypass Python-Markdown entirely, page.toc is empty after
        page.render() — the toc extension never sees any Markdown headings.
        We rebuild it here by parsing the id-annotated <hN> elements that
        the heading node override in markdoc.config.js already produced.
        """
        page.toc = _toc_from_html(html)
        return html

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _run_node_runner(self, markdown: str) -> subprocess.CompletedProcess:
        """Pipe *markdown* into markdoc_runner.js and return the result."""
        cmd = [self._node_exec, str(_RUNNER_PATH)]
        if self.config["markdoc_config"]:
            cmd += ["--config", self.config["markdoc_config"]]

        return subprocess.run(
            cmd,
            input=markdown,
            capture_output=True,
            text=True,
            timeout=self.config["timeout"] / 1000,  # subprocess uses seconds
        )

    def _run_node(self, script: str) -> subprocess.CompletedProcess:
        """Run an inline Node.js *script* string for quick checks."""
        return subprocess.run(
            [self._node_exec, "-e", script],
            capture_output=True,
            text=True,
            timeout=10,
        )
