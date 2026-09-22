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

**Dated tag**:
An immutable snapshot of one build of a variant, suffixed with the build
date (e.g. `claude-code-docker-20260922`). What consumers pin to.
_Avoid_: version tag, release tag
