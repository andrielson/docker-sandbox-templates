# CLAUDE.md

This file provides guidance to AGENTS when working with code in this repository.

## Repository state

This repository builds and publishes custom templates for Docker Sandboxes:
ready-to-run, batteries-included environments for coding agents, built on the
official `docker/sandbox-templates` base images. The publishing layout — a
single image with one rolling tag per variant plus immutable dated tags — is
recorded in `docs/adr/0001-variant-tags-mirror-upstream.md`.

The only variant today is `claude-code-docker` (`src/Dockerfile`): a
kitchen-sink environment for the Claude Code agent — Node.js 26, Bun, Nix
(flakes), Rust, uv/ruff/ty — on top of the `claude-code-docker` base, which
ships a full Docker Engine inside the sandbox.

There is no application code. The repository is Dockerfiles plus prewired
quality tooling: Biome and Prettier with strict ownership, ShellCheck, `tsc`,
Husky hooks (activated by `bun install`), and the agent tooling described
below. The `.husky/*.ts` hooks count as TypeScript inputs, so
`bun run typecheck` passes.

## Commands

- `bun install` — install dependencies (also activates the git hooks, via the `prepare` script)
- `bun run <file>` — run a script directly
- `bun test` — run all tests; `bun test path/to/file.test.ts` for one file, `bun test -t "<name>"` for one test
- `bun run lint` / `bun run lint:fix` — Biome check (TS family), with and without auto-fix
- `bun run lint:compose` — validate the tests Compose file against the schema
- `bun run lint:sh` — ShellCheck over the tracked shell scripts
- `bun run format` / `bun run format:check` — Prettier write/check (markdown, YAML, shell, Dockerfile)
- `bun run typecheck` — `tsc --noEmit`
- Build and publish the template image — see [Build and publish](README.md#build-and-publish) in the README for the exact multi-arch `docker buildx build` invocation (rolling + dated tags, `--push`)

## Building images

Conventions for the template Dockerfiles:

- Pin every tool version as an `ARG` at the top of the file; never rely on an implicit `latest`.
- The sandbox base images default to the non-root `agent` user with passwordless sudo. System packages (apt, NodeSource) are installed through `sudo` from that user; `USER root` appears only in the assembly stage (`scratch-copies`), for the recursive `chown`. Tools that must live in the agent's home directory (bun, rustup, uv, nix) are staged under `/__SCRATCH__/home/agent` and copied in with `agent:agent` ownership — installed as root they would land under `/root/`, where the agent user cannot use them.
- Extend the `-docker` base variants only when the sandbox needs in-sandbox container builds: they run privileged, with a block volume at `/var/lib/docker`.
- The build context is `src/`; the Dockerfile has no `COPY` from the context — only URL `ADD`s and cross-stage copies.
- Keep both architecture stages (`FROM scratch-${TARGETARCH}`) working: images are built for `linux/amd64` and `linux/arm64`.

## TypeScript strictness (tsconfig.json)

- `strict` and `noUncheckedIndexedAccess` are on — indexing an array/map yields `T | undefined`.
- `verbatimModuleSyntax` is on — type-only imports must use `import type { ... }`.
- `allowImportingTsExtensions` is on — relative imports may include the `.ts` extension.

## Bun over Node.js

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

### Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root, created lazily when terms or decisions actually get resolved. See `docs/agents/domain.md`.

## Conventions

- Write everything the agent produces in English, regardless of the language the user speaks in the conversation (e.g., Portuguese). This covers code, code comments, documentation and any other files added to the repo, commit messages, GitHub content created via `gh` (issues, issue comments, pull request descriptions, review comments), written plans and design/spec documents produced before or during implementation, and any other generated artifact or written output. Only direct conversational replies in chat may mirror the user's language.
- Always use the long format for command arguments (e.g., `docker compose --file ... --project-name ...`, not `-f`/`-p`) — it is easier to read for someone unfamiliar with the options. This covers shell commands in general, including `RUN` statements in Dockerfiles and the shell scripts of projects derived from this template. Where a tool has no long options (e.g., BusyBox utilities in Alpine-based images), short flags are fine — leave a comment saying so.
- In Docker Compose files, prefer the long syntax too: volumes as `type:`/`source:`/`target:` entries and ports as `target:`/`published:`, not the `- source:target` or `- host:container` shorthand.
- Prefer nested `.gitignore` files (e.g., `tests/.gitignore`) instead of including everything in the root `.gitignore`.
- Keep `README.md` current. Whenever the project is modified, check whether the README still reflects reality — objective, architecture, setup commands, tests — and update it in the same change whenever it does not.
- Lint, formatting and type checking are enforced by two formatters with strict ownership plus `tsc`. Biome owns the TS family (`ts`, `tsx`, `js`, `jsx`, `json`, `jsonc`) via `bun run lint` (check) and `bun run lint:fix` (auto-fix); Prettier owns markdown, YAML, shell and Dockerfile via `bun run format` (write) and `bun run format:check`, using `prettier-plugin-sh` (policy in `.prettierrc`); `bun run typecheck` runs `tsc --noEmit`. The two formatters must never own the same file — `.prettierignore` excludes the Biome-owned extensions so a repo-wide Prettier run never crosses the boundary.
- Git hooks run through Husky and activate themselves: the `prepare` lifecycle script runs on every `bun install` and points `core.hooksPath` at `.husky/_`, so a fresh clone needs zero manual setup. Escape hatches: `git commit --no-verify` skips a hook once, `HUSKY=0` disables Husky entirely. Hook logic is always written in TypeScript executed by Bun. Because Husky runs hook files through `sh` (a Bun shebang would not be honored), every extensionless hook under `.husky/` is a minimal shell shim delegating to its sibling `.ts` implementation — `exec bun "$(dirname -- "$0")/<hook>.ts" "$@"` — which is the only place Biome and `tsc` see the hooks (`tsconfig.json` includes `.husky/` explicitly because TypeScript's `**` skips dot-directories; `biome.json` mirrors the include); new hooks must follow this shape. To run subprocesses, hooks use the Bun Shell — `import { $ } from "bun";` — whenever possible, in preference to `Bun.spawn`. Three hooks exist: `pre-commit` runs lint-staged first — the fixers in `.lintstagedrc.json` (Biome and Prettier on staged files, re-staging whatever changed; blocking verifiers deliberately stay out of lint-staged because it runs glob groups concurrently and a checker racing a writer is not deterministic) — then the gates: ShellCheck on staged shell files and the full type check; `post-checkout` and `post-merge` rerun `bun install` unconditionally (a no-op install is sub-second, and file checkouts can also restore dependency manifests from another commit).
- Whenever information about a third-party project is needed (APIs, CLI, runtime behavior, releases, internals), research it through the `deepwiki` MCP against that project's GitHub repository (e.g., Bun via `oven-sh/bun`). The `deepwiki` skill in `.claude/skills/deepwiki/` describes the workflow; the MCP server itself is declared in `.mcp.json` and pre-approved in `.claude/settings.json` (`enabledMcpjsonServers` plus the `mcp__deepwiki__*` allow rule), so it connects without a first-use prompt.
- Shell scripts are linted with ShellCheck via `bun run lint:sh`, using the local `shellcheck` binary (see the README prerequisites); `.shellcheckrc` holds the repo-wide ShellCheck policy (bash dialect, enabled optional rules, disabled codes). Formatting goes through Prettier with `prettier-plugin-sh`, which embeds the shfmt engine — no host `shfmt` binary is needed — via `bun run format` / `bun run format:check`, with the shell policy (indent, `switchCaseIndent`, `spaceRedirects`, `binaryNextLine`) living in `.prettierrc`. The pre-commit hook runs ShellCheck on staged shell files; their formatting rides the same lint-staged Prettier task as every other Prettier-owned file.
- In shell scripts, prefer single quotes for literal strings without expansions; switch to double quotes as soon as the string contains a variable or command substitution (ShellCheck's SC2016 flags the mistake). prettier-plugin-sh preserves quote style, so this is an authoring convention enforced by review, not by tooling.
