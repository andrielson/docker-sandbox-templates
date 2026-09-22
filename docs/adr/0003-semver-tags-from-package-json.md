# Semver tags from package.json, published by CI

Publication is a CI concern. Merging to `main` with a bumped `version` field
in `package.json` builds both architectures on native runners
(`ubuntu-latest` and `ubuntu-24.04-arm`, no QEMU — its emulated Nix stage
would be untenably slow, and the arm64 job doubles as proof the image builds
on that architecture), each pushes an anonymous digest, and a merge job
stitches the manifest list under two tags. The registry tags mirror the
upstream `sandbox-templates` scheme: the rolling variant tag
(`claude-code-docker`) and the immutable semver tag
(`claude-code-docker-0.1.0`-style, no `v` prefix — the upstream tags its own
`claude-code-docker-0.5.0` the same way).

The publication record is the git tag `v<version>` plus its GitHub Release,
created by the merge job: present means already released, absent means
publish, and a failed publish self-heals on the next run because the tag
never landed. The Publish jobs gate on Hygiene alone — the `main` ruleset
already requires the Test suite green on every pull request, so re-gating
the merge adds a heavy build for no new signal.

This supersedes [ADR-0001](0001-variant-tags-mirror-upstream.md), which
dated every build (`<variant>-YYYYMMDD`) as the pin target. The single
image, one rolling tag per variant layout survives unchanged.

## Considered Options

- **Semver from package.json (chosen)** — a bump is an explicit act of
  releasing with a comparable, ordered version; the git tag gives CI a
  natural publication record, and consumers can tell which of two tags is
  newer.
- **Dated tags (ADR-0001, superseded)** — the build date is honest about
  when the image was made but signals no intent: a tool bump and a
  variant-breaking change both "just happen", and dates do not sort as
  versions across variants.
- **Per-variant versions** — upstream versions each variant independently,
  but with one maintainer and shared kitchen-sink layers a single release
  train is simpler; revisit when variants diverge in pace.
