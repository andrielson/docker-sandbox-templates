# One image, one tag per variant, mirroring upstream

All templates are published under a single image,
`ghcr.io/andrielson/sandbox-templates`, with one tag per variant reusing the
upstream `docker/sandbox-templates` variant names (`claude-code-docker`
today; `codex`, `opencode` and friends later), instead of one image per
variant. Every build also pushes an immutable dated tag
(`<variant>-YYYYMMDD`, e.g. `claude-code-docker-20260922`) for consumers to
pin; the variant-named tag is the rolling one.

## Considered Options

- **One image, variant tags (chosen)** — mirrors the upstream
  `docker/sandbox-templates` layout, so naming is already familiar, all
  variants are discoverable in one place, and consumers authenticate against
  a single registry namespace.
- **One image per variant** — would allow independent CI and lifecycle per
  variant, but fragments discovery and multiplies registry configuration for
  no current need; revisit if variants diverge enough to warrant it.
- **Semantic version tags** — the images bundle third-party tools at pinned
  versions rather than exposing an API, so semver would signal nothing; the
  build date is the honest version.
