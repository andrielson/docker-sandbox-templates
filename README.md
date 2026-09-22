# docker-sandbox-templates

Custom templates for [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/):
OCI images that extend the official `docker/sandbox-templates` base images
with a batteries-included development environment.

Everything is published under a single image,
`ghcr.io/andrielson/sandbox-templates`, with one tag per variant mirroring
the upstream variant names — see
[ADR-0001](docs/adr/0001-variant-tags-mirror-upstream.md). Terminology lives
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

Every build of a variant is published under two tags:

- **Rolling tag** — the variant name (`claude-code-docker`): mutable, always
  points at the latest build.
- **Dated tag** — `claude-code-docker-20260922` (build date, UTC): immutable
  snapshot. Pin this one in automation.

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
- **Docker Desktop** — building and pushing the images.

### Build and publish

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/andrielson/sandbox-templates:claude-code-docker \
  --tag ghcr.io/andrielson/sandbox-templates:claude-code-docker-$(date --utc +%Y%m%d) \
  --push src/
```

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

### Agent tooling

- **DeepWiki MCP** (`.mcp.json`) answers questions about public GitHub
  repositories; the `deepwiki` skill in `.claude/skills/` describes when and
  how to use it.
- **Agent workflows** — `docs/agents/` holds the workflows for coding agents
  (issue tracker via `gh`, triage labels, domain docs); start at
  `CLAUDE.md`.

### Project layout

- `src/Dockerfile` — the `claude-code-docker` template
- `CONTEXT.md` — the project glossary
- `docs/adr/` — architecture decision records
- `docs/agents/` — agent workflow docs

## Conventions

- All repository content is written in English.
- Commands use long options wherever the tool provides them.
- Tool versions in Dockerfiles are pinned via `ARG`s.

See `CLAUDE.md` for the full list, including Bun-over-Node preferences and
shell quoting rules.
