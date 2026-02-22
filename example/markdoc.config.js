/**
 * markdoc.config.js
 *
 * Site-specific Markdoc variables, accessible in any page as {% $name %}.
 *
 * The plugin provides all standard tags (callout, tabs, badge, details,
 * comment) and functions (upper, lower, concat, default) out of the box —
 * no need to define them here.  This file exists only to supply the
 * project-specific variable values used in the showcase.
 */

"use strict";

module.exports = {
  variables: {
    version: "0.1.0",
    project: "mkdocs-markdoc",
    stable: true,
  },
};
