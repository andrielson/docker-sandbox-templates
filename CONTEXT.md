# Docker Sandbox Templates

The vocabulary of the sandbox templates this repository builds for Docker
Sandboxes.

## Language

**Sandbox template**:
A reusable image that captures a configured environment (tools, packages,
configuration) for Docker Sandboxes, so it does not need to be rebuilt per
session. Each sandbox template is named by its variant.
_Avoid_: GitHub template, boilerplate

**Variant**:
The named agent setup a sandbox template extends, and the tag it is
published under (e.g. `claude-code-docker`). Mirrors the variant names of
the upstream image.
_Avoid_: flavor, agent, agent image

**Base image**:
The upstream `docker/sandbox-templates` image a variant is named after.
Every sandbox template is built by extending its variant's base image.

**Rolling tag**:
The variant-named, mutable tag that always points to the most recent build
of that variant.
_Avoid_: latest tag

**Version tag**:
The immutable tag of one published build of a variant, suffixed with the
semver from `package.json` at build time (e.g. `claude-code-docker-0.1.0`).
What consumers pin to.
_Avoid_: dated tag, release tag

**Image contract**:
What a sandbox template delivers by itself, with no boot-time script and no
external stack. In this repository that is everything — all toolchains are
baked at build time.
_Avoid_: runtime contract, bootstrap contract

**Baked toolchain**:
A toolchain installed into the image at build time, as opposed to one
provisioned on first boot.
_Avoid_: preinstalled, runtime-installed

**Tests stack**:
The standalone throwaway Compose project (`tests/docker-compose.yml`) the
test suite builds and probes — isolated from any live deployment by its own
project name and image tag.
_Avoid_: test environment, CI stack

**Base inheritance**:
The surface the final image inherits from its variant's Base image (the
`agent` user, the `tini` entrypoint, the `claude` command, `BASH_ENV`) that
later build stages must not regress.
_Avoid_: base config, upstream contract
