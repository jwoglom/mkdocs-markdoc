"""
MkDocs plugin that replaces the default Python-Markdown renderer with
Stripe's Markdoc, via a persistent Node.js subprocess.
"""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
import threading
from html.parser import HTMLParser
from pathlib import Path
from queue import Empty, Queue
from typing import Any

from mkdocs.config import config_options
from mkdocs.config.base import Config
from mkdocs.plugins import BasePlugin
from mkdocs.structure.files import File, Files
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

    # Milliseconds before a single-page render is killed and an error raised.
    timeout = config_options.Type(int, default=30_000)


class MarkdocPlugin(BasePlugin[MarkdocPluginConfig]):
    """
    Intercepts raw Markdown on every page and hands it to a persistent Node.js
    Markdoc process.  The process is started once per build in on_config,
    eliminating per-page Node.js VM startup and module-load overhead.

    Lifecycle
    ---------
    on_config        – validate Node.js, start the persistent subprocess.
    on_files         – inject the bundled markdoc.css asset.
    on_page_markdown – send each page to Node.js over stdin, receive HTML.
    on_page_content  – rebuild page.toc from the id-annotated headings.
    on_shutdown      – close the subprocess cleanly.
    """

    _proc: subprocess.Popen | None = None

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

        # Inject the bundled stylesheet so it loads before any user extra_css.
        config.setdefault("extra_css", []).insert(0, "assets/markdoc.css")

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

        # Start the persistent Node.js process for the duration of the build.
        cmd = [self._node_exec, str(_RUNNER_PATH)]
        if self.config["markdoc_config"]:
            cmd += ["--config", self.config["markdoc_config"]]

        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,   # inherit – unexpected Node crashes surface immediately
            text=True,
            encoding="utf-8",
        )
        log.debug("mkdocs-markdoc: started persistent Node.js process (pid %d)", self._proc.pid)

        return config

    def on_files(self, files: Files, config: dict[str, Any], **kwargs: Any) -> Files:
        """Inject the bundled markdoc.css into the MkDocs file collection."""
        files.append(File(
            path="assets/markdoc.css",
            src_dir=str(Path(__file__).parent),
            dest_dir=config["site_dir"],
            use_directory_urls=config["use_directory_urls"],
        ))
        return files

    # ------------------------------------------------------------------
    # Core hooks
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
        return self._render(markdown, page.file.src_path)

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

    def on_shutdown(self) -> None:
        """Cleanly terminate the persistent Node.js process."""
        if self._proc and self._proc.poll() is None:
            self._proc.stdin.close()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()
            log.debug("mkdocs-markdoc: Node.js process exited")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _render(self, markdown: str, src_path: str) -> str:
        """Send one page to the persistent Node process and return HTML."""
        if self._proc is None or self._proc.poll() is not None:
            raise RuntimeError(
                "mkdocs-markdoc: Node.js process is not running."
            )

        msg = json.dumps({"markdown": markdown}) + "\n"
        self._proc.stdin.write(msg)
        self._proc.stdin.flush()

        # Read the response line in a background thread so we can enforce the
        # per-page timeout without blocking the main thread indefinitely.
        q: Queue[str | Exception] = Queue()

        def _read() -> None:
            try:
                q.put(self._proc.stdout.readline())
            except Exception as exc:  # noqa: BLE001
                q.put(exc)

        threading.Thread(target=_read, daemon=True).start()

        timeout_s = self.config["timeout"] / 1000
        try:
            result = q.get(timeout=timeout_s)
        except Empty:
            self._proc.kill()
            raise RuntimeError(
                f"mkdocs-markdoc: Node.js timed out after {self.config['timeout']} ms "
                f"while processing '{src_path}'."
            )

        if isinstance(result, Exception):
            raise RuntimeError(
                f"mkdocs-markdoc: error reading from Node.js process: {result}"
            )

        if not result:
            raise RuntimeError(
                f"mkdocs-markdoc: Node.js process exited unexpectedly while "
                f"processing '{src_path}'."
            )

        response = json.loads(result)

        if "error" in response:
            raise RuntimeError(
                f"mkdocs-markdoc: Markdoc rendering failed for '{src_path}'.\n"
                f"Node error: {response['error']}"
            )

        for warning in response.get("warnings", []):
            log.warning("mkdocs-markdoc [%s]: %s", src_path, warning)

        html = response["html"]
        if not html:
            log.warning(
                "mkdocs-markdoc: empty HTML output for '%s' – returning empty string.",
                src_path,
            )

        return html

    def _run_node(self, script: str) -> subprocess.CompletedProcess:
        """Run an inline Node.js *script* string for quick checks."""
        return subprocess.run(
            [self._node_exec, "-e", script],
            capture_output=True,
            text=True,
            timeout=10,
        )
