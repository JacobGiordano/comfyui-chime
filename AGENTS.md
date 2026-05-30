# AGENTS.md

Repo guidance for Codex-style agents working in this project.

## Overview

This repository contains a small ComfyUI custom node that plays a frontend sound when execution reaches the node.

- Backend node logic and HTTP routes live in `nodes.py`
- Frontend playback logic lives in `web/chime.js`
- Packaged custom sounds live in `sounds/`
- `__init__.py` exposes the node to ComfyUI
- `README.md` should stay aligned with behavior and supported inputs

## Working Rules

- Preserve the receiver-only behavior of the `Chime` node unless the user explicitly asks for a passthrough or outputs
- Keep compatibility with supported ComfyUI Web and ComfyUI Desktop environments in mind when changing event payloads, routes, or audio behavior
- Prefer small, surgical changes over broad refactors
- If node inputs, defaults, categories, route paths, or sound handling change, update `README.md` in the same pass
- Treat browser audio compatibility as a product concern, not just a code concern

## Implementation Notes

- The node is an output node with no return types; avoid introducing graph outputs accidentally
- `sound` supports built-in choices, a `custom` option, and discovered `custom:filename.ext` entries
- Repo-local custom sounds should resolve through `sounds/`
- Absolute file paths in `custom_sound` are supported through tokenized temporary routes
- Keep path handling constrained so repo-local file serving cannot escape `sounds/`
- Maintain the existing straightforward style and prefer backward-compatible frontend event changes

## Verification

When practical, verify changes by checking:

- Python files still compile or import cleanly
- The node still registers as `Chime`
- Built-in sounds still work
- Custom sounds from `sounds/` still resolve
- Absolute-path custom sounds still resolve safely

If full runtime verification is not possible in this environment, say so explicitly in the final handoff.

## Workflow

Always execute directly against the user's request unless they explicitly ask for a plan.

1. Skip formal planning unless the user explicitly requests it.
2. Prefer lightweight verification that matches the change, such as Python compilation checks, import validation, or focused manual review of frontend behavior.
3. If tests or validation uncover additional bugs outside the original scope, summarize them clearly and confirm whether to fix them in the same pass.
4. GitHub issues may exist because the repo is public, but do not assume an issue-driven workflow unless the user explicitly asks for it.
5. Report completion before any merge, push, branch deletion, or issue-closing action.
6. Do not merge to `main`, push, or delete branches without explicit authorization.
