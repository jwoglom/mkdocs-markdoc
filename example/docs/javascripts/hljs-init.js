/**
 * hljs-init.js
 *
 * Loads highlight.js from CDN and runs it over every
 * <pre><code class="language-*"> block that Markdoc produces.
 *
 * Why client-side? The plugin bypasses Python-Markdown entirely, so
 * Pygments (MkDocs / Material's normal server-side highlighter) is never
 * invoked. highlight.js is the lightest drop-in replacement.
 */

(function () {
  "use strict";

  const HLJS_VERSION = "11.10.0";
  const CDN = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HLJS_VERSION}`;

  function loadCSS(href) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src, onload) {
    const s = document.createElement("script");
    s.src = src;
    s.onload = onload;
    document.head.appendChild(s);
  }

  function applyHighlighting() {
    // highlight.js auto-detect works on <pre><code class="language-X"> blocks
    if (typeof hljs === "undefined") return;
    document.querySelectorAll("pre code[class^='language-'], pre code:not([class])").forEach((block) => {
      hljs.highlightElement(block);
    });
  }

  // Pick a theme that complements Material's dark/light toggle.
  // We swap the stylesheet href when the user toggles the colour scheme.
  function getThemeHref(dark) {
    const theme = dark ? "github-dark" : "github";
    return `${CDN}/styles/${theme}.min.css`;
  }

  function isDark() {
    return document.body.getAttribute("data-md-color-scheme") === "slate";
  }

  let themeLink = null;

  function applyTheme() {
    if (!themeLink) return;
    themeLink.href = getThemeHref(isDark());
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Inject the hljs stylesheet
    themeLink = document.createElement("link");
    themeLink.rel = "stylesheet";
    themeLink.href = getThemeHref(isDark());
    document.head.appendChild(themeLink);

    // Load core + common languages
    loadScript(`${CDN}/highlight.min.js`, function () {
      applyHighlighting();

      // Re-highlight after Material's instant navigation swaps the page body
      document.addEventListener("DOMContentSwitch", applyHighlighting);

      // Sync hljs theme with Material's dark/light toggle
      const observer = new MutationObserver(applyTheme);
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["data-md-color-scheme"],
      });
    });
  });
})();
