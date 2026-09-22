# docker-sandbox-templates

Custom templates for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/):
OCI images that extend the official `docker/sandbox-templates` base images
with a batteries-included development environment.

Everything is published under a single image,
`ghcr.io/andrielson/sandbox-templates`, with one tag per variant mirroring
the upstream variant names — see
[ADR-0003](docs/adr/0003-semver-tags-from-package-json.md). Terminology lives
in [`CONTEXT.md`](CONTEXT.md).

## Available templates

| Rolling tag          | Base image                                    | Agent       |
| -------------------- | --------------------------------------------- | ----------- |
| `claude-code-docker` | `docker/sandbox-templates:claude-code-docker` | Claude Code |

### `claude-code-docker`

A kitchen-sink environment for the Claude Code agent, on top of the
`claude-code-docker` base (Claude Code plus a full Docker Engine inside the
sandbox):

- **Node.js 26** (NodeSource) and **Bun 1.4.2** (with `bunx` and bash
  completion)
- **Nix 2.35.2** (single-user install, flakes enabled) with a profile
  including Go, Java 25, Kotlin, Scala, Gradle, Maven, PHP + Composer,
  Quarkus, `gh`, `git`, `glab`, `ripgrep`, `jq`, `yq`, `shellcheck` and more
- **Rust 1.98.1** (rustup, stable toolchain)
- **uv**, **ruff** and **ty** for Python (default Python 3.14)
- `build-essential` and `bash-completion`

Built for both `linux/amd64` and `linux/arm64`.

## Tags

Every published build of a variant carries two tags:

- **Rolling tag** — the variant name (`claude-code-docker`): mutable, always
  points at the latest published build.
- **Version tag** — `claude-code-docker-0.1.0`: the semver from
  `package.json` at build time, immutable. Pin this one in automation.

## Usage

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with
  Sandboxes enabled (the `sbx` CLI).

### Authenticate the sandbox runtime to GHCR

The sandbox daemon pulls templates straight from the registry — it does not
reuse your local Docker login, and non-Docker-Hub registries require
credentials even for public images:

```bash
gh auth token | sbx secret set --registry ghcr.io --password-stdin
```

### Run

```bash
sbx run --template ghcr.io/andrielson/sandbox-templates:claude-code-docker claude
```

Unlike Docker commands, `sbx` does not auto-resolve registry domains, so the
`ghcr.io/` prefix is required.

### Caveats

- Agent configuration files (e.g. `/home/agent/.claude/settings.json`) are
  recreated at sandbox creation and do not persist in the template.
- Agent and tool versions are baked into the image and do not auto-update;
  update them inside the sandbox or rebuild.
- Sandboxes restrict network access by default; allow what you need, e.g.
  `sbx policy allow network 'registry.npmjs.org:443'`.

### Local alternative (no registry)

```bash
docker buildx build --platform linux/amd64 --tag sandbox-templates:claude-code-docker src/
docker image save sandbox-templates:claude-code-docker --output sandbox-templates.tar
sbx template load sandbox-templates.tar
sbx run --template sandbox-templates:claude-code-docker claude
```

## Development

### Prerequisites

- **Bun** (1.4+) — runs the scripts, the test suite and the git hooks.
- **ShellCheck** (0.10+) — shell linting (`lint:sh` and the pre-commit
  gate). Shell _formatting_ needs no host binary: it goes through Prettier
  and `prettier-plugin-sh`.
- **Docker Desktop** — building and pushing the images, and running the
  test suite (a cold build is heavy).

### Build and publish

Publishing is a CI job, not a local command. Whenever a merge to `main`
bumps the `version` field in `package.json`, CI builds both architectures
on native runners, merges them into one manifest list and pushes the
rolling and version tags to GHCR; the git tag `v<version>` and its GitHub
Release are the publication record (ADR-0003). To release:

1. Bump `version` in `package.json` (strict `X.Y.Z` semver).
2. Merge to `main` — the Publish jobs take it from there.

A `workflow_dispatch` run on `main` re-evaluates the same gates: a publish
that failed midway self-heals (the git tag never landed), an already
released version is skipped.

### CI

`.github/workflows/ci.yml` runs on pull requests, merges to `main` and
manual dispatch:

- **Hygiene** — Biome, Prettier, `tsc`, ShellCheck and the Compose schema.
- **Test suite** — the image-contract tests, cache-warmed from the
  published image; skips on draft PRs and documentation-only diffs.
- **Publish** — releases the image as described above.

The `main` ruleset requires Hygiene and Test suite on every pull request
and blocks direct pushes, so nothing reaches `main` untested.

### Repository tooling

```bash
bun install
```

`bun install` also activates the git hooks: the `prepare` lifecycle script
points `core.hooksPath` at `.husky/_`, so a fresh clone needs zero manual
setup.

| Command                | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `bun install`          | Install dependencies (and activate the git hooks)  |
| `bun run lint`         | Biome check (TS family)                            |
| `bun run lint:compose` | Validate the tests Compose file                    |
| `bun run lint:fix`     | Biome check with auto-fix                          |
| `bun run lint:sh`      | ShellCheck over the tracked shell scripts          |
| `bun run format`       | Prettier write (markdown/YAML/shell/Dockerfile)    |
| `bun run format:check` | Prettier check, no changes applied                 |
| `bun run typecheck`    | `tsc --noEmit`                                     |
| `bun test`             | Run the test suite (Bun's test runner is built in) |

Formatting is split between two tools with strict ownership — they never
touch the same file: **Biome** owns the TS family (`ts`, `tsx`, `js`,
`jsx`, `json`, `jsonc`); **Prettier** owns markdown, YAML, shell and
Dockerfile. The `pre-commit` hook runs lint-staged fixers, ShellCheck on
staged shell files and the full type check.

### Tests

`tests/docker.test.ts` verifies the Image contract of `src/Dockerfile`:
everything the multi-stage build bakes — the pinned toolchains (Bun, Rust,
Node, Nix), the Nix profile tools, the environment defaults, file ownership
and the config inherited from the base image. The suite builds the image
through the throwaway Tests stack (`tests/docker-compose.yml`, isolated by
its own project name; the build context reaches `src/` through the
`tests/src` symlink — see ADR 0002) and probes a standing one-off container.

```bash
bun test             # full suite: builds the image first (a cold build is heavy)
bun run lint:compose # validate the tests Compose file
```

A cold build pulls base images and compiles the Nix profile — expect tens of
minutes; later runs hit the local BuildKit cache.

### Agent tooling

- **DeepWiki MCP** (`.mcp.json`) answers questions about public GitHub
  repositories; the `deepwiki` skill in `.claude/skills/` describes when and
  how to use it.
- **Agent workflows** — `docs/agents/` holds the workflows for coding agents
  (issue tracker via `gh`, triage labels, domain docs); start at
  `CLAUDE.md`.

### Project layout

- `src/Dockerfile` — the `claude-code-docker` template
- `tests/` — the image-contract test suite and its Tests stack
- `CONTEXT.md` — the project glossary
- `docs/adr/` — architecture decision records
- `docs/agents/` — agent workflow docs

## Conventions

- All repository content is written in English.
- Commands use long options wherever the tool provides them.
- Tool versions in Dockerfiles are pinned via `ARG`s.

See `CLAUDE.md` for the full list, including Bun-over-Node preferences and
shell quoting rules.
