# syntax=docker/dockerfile:1
ARG TARGETARCH
ARG BUN_VERSION=1.4.2-debian
ARG NIX_VERSION=2.35.2
ARG RUST_VERSION=1.98.1-slim-trixie
ARG SBX_TEMPLATE=claude-code-docker


FROM scratch AS scratch-amd64

ARG NIX_VERSION

ADD --link https://releases.nixos.org/nix/nix-${NIX_VERSION}/nix-${NIX_VERSION}-x86_64-linux.tar.xz /nix-linux.tar.xz


FROM scratch AS scratch-arm64

ARG NIX_VERSION

ADD --link https://releases.nixos.org/nix/nix-${NIX_VERSION}/nix-${NIX_VERSION}-aarch64-linux.tar.xz /nix-linux.tar.xz


FROM scratch-${TARGETARCH} AS scratch-target-arch


FROM oven/bun:${BUN_VERSION} AS scratch-bun

RUN mkdir --parents --verbose \
  /__SCRATCH__/home/agent/.local/bin \
  /__SCRATCH__/home/agent/.local/share/bash-completion/completions \
  && cd /__SCRATCH__/home/agent/.local/share/bash-completion/completions \
  && SHELL=bash bun completions > ./bun.completion.bash \
  && cd /__SCRATCH__/home/agent/.local/bin \
  && mv --verbose /usr/local/bin/bun . \
  && ln --symbolic --verbose ./bun ./bunx


FROM rust:${RUST_VERSION} AS scratch-rust

RUN RUSTUP_PREVIOUS_TOOLCHAIN=$(rustup show active-toolchain | awk '{print $1}') \
  && rustup set profile default \
  && rustup default stable \
  && rustup toolchain uninstall ${RUSTUP_PREVIOUS_TOOLCHAIN} \
  && mkdir --parents --verbose /__SCRATCH__/home/agent \
  && cd /__SCRATCH__/home/agent \
  && mv --verbose /usr/local/cargo .cargo \
  && mv --verbose /usr/local/rustup .rustup


FROM docker/sandbox-templates:${SBX_TEMPLATE} AS scratch-uv

ENV PATH="/home/agent/.local/bin:$PATH" \
  UV_CACHE_DIR="/tmp/uv-cache" \
  UV_COMPILE_BYTECODE=1 \
  UV_MALWARE_CHECK=1 \
  UV_NO_MODIFY_PATH=1 \
  UV_PYTHON="3.14" \
  UV_TORCH_BACKEND="cpu"

ADD --link https://astral.sh/uv/install.sh /opt/uv-install.sh

WORKDIR /home/agent/

RUN sudo mkdir --parents --verbose /__SCRATCH__/home/agent/ \
  && sudo chown --recursive --verbose agent:agent \
    /__SCRATCH__/home/agent/ \
    /opt/ \
  && bash /opt/uv-install.sh \
  && uv tool install ruff \
  && uv tool install ty \
  && mv .config .local /__SCRATCH__/home/agent/


FROM docker/sandbox-templates:${SBX_TEMPLATE} AS scratch-root

ENV BUN_INSTALL="/home/agent/.local" \
  CARGO_HOME="/home/agent/.cargo" \
  RUSTUP_HOME="/home/agent/.rustup" \
  UV_COMPILE_BYTECODE=1 \
  UV_MALWARE_CHECK=1 \
  UV_PYTHON="3.14" \
  UV_TORCH_BACKEND="cpu"

RUN curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 10 --retry-delay 5 --retry-connrefused https://deb.nodesource.com/setup_26.x | sudo -E bash - \
  && sudo apt-get --quiet --quiet --yes --fix-missing update \
  && sudo apt-get --quiet --quiet --yes --fix-missing dist-upgrade \
  && sudo apt-get --quiet --quiet --yes --fix-missing install --no-install-recommends \
    bash-completion \
    build-essential \
    nodejs \
    xz-utils


FROM scratch-root AS scratch-nix

COPY --from=scratch-target-arch --chown=agent:agent /nix-linux.tar.xz /tmp/nix-linux.tar.xz

ENV PATH="/home/agent/.nix-profile/bin:$PATH"

RUN tar --directory=/tmp --extract --strip-components=1 --file=/tmp/nix-linux.tar.xz \
  && /tmp/install \
    --no-channel-add \
    --no-daemon \
    --yes \
  && mkdir --parents --verbose /home/agent/.config/nix \
  && printf '%s\n' \
    'experimental-features = nix-command flakes' \
    'sandbox = false' \
    >> /home/agent/.config/nix/nix.conf \
  && nix profile add \
    nixpkgs#brotli \
    nixpkgs#bubblewrap \
    nixpkgs#curl \
    nixpkgs#fnm \
    nixpkgs#gh \
    nixpkgs#git \
    nixpkgs#glab \
    nixpkgs#go \
    nixpkgs#gradle_9 \
    nixpkgs#htop \
    nixpkgs#jq \
    nixpkgs#kotlin \
    nixpkgs#lz4 \
    nixpkgs#maven \
    nixpkgs#nano \
    nixpkgs#openjdk25 \
    nixpkgs#php \
    nixpkgs#phpPackages.composer \
    nixpkgs#quarkus \
    nixpkgs#ripgrep \
    nixpkgs#rsync \
    nixpkgs#scala \
    nixpkgs#shellcheck \
    nixpkgs#unzip \
    nixpkgs#wget \
    nixpkgs#yq-go \
    nixpkgs#zip \
    nixpkgs#zstd \
  && sudo mkdir --parents --verbose /__SCRATCH__/home \
  && sudo mv /nix /__SCRATCH__/nix \
  && sudo mv /home/agent /__SCRATCH__/home/agent \
  && sudo chown --recursive agent:agent /__SCRATCH__/


FROM docker/sandbox-templates:${SBX_TEMPLATE} AS scratch-copies

USER root

# Bun
COPY --link --from=scratch-bun /__SCRATCH__/ /__SCRATCH__/

# nix
COPY --link --from=scratch-nix /__SCRATCH__/ /__SCRATCH__/

# Rust
COPY --link --from=scratch-rust /__SCRATCH__/ /__SCRATCH__/

#uv
COPY --link --from=scratch-uv /__SCRATCH__/ /__SCRATCH__/

RUN chown --recursive agent:agent /__SCRATCH__/


FROM scratch-root

COPY --from=scratch-copies /__SCRATCH__/ /

ENV PATH="/home/agent/.local/bin:/home/agent/.nix-profile/bin:/home/agent/.cargo/bin:$PATH"
