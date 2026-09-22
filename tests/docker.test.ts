import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test'
import { $ } from 'bun'

// Every docker compose invocation in this suite goes through this prefix:
// the Tests compose file plus the shared project name. Bun Shell expands an
// interpolated array into separate arguments.
const compose = [
  'docker',
  'compose',
  '--file',
  'tests/docker-compose.yml',
  '--project-name',
  'docker-sandbox-templates-tests',
]

// bun:test kills tests after 5s by default; every test here shells into
// Docker (an exec or an inspect round-trip), so the suite-wide default
// covers them all — only the hooks below carry their own explicit timeouts.
setDefaultTimeout(60_000)

// The build fetches base images and compiles the Nix profile over the
// network, and a cold build can take the better part of an hour, so every
// hook carries an explicit timeout.
beforeAll(async () => {
  // Defensive teardown first: the afterAll guarantee does not cover SIGKILL.
  await $`${compose} down --volumes --remove-orphans`.nothrow().quiet()
  // Not quiet: build progress echoes live, and a failure throws ShellError
  // with stderr attached.
  await $`${compose} build --pull`
}, 3_600_000)

afterAll(async () => {
  await $`${compose} down --volumes --remove-orphans`.nothrow().quiet()
}, 120_000)

// The suite verifies the Image contract: everything the Dockerfile bakes at
// build time. This project has no first-boot provisioning — no entrypoint
// script of its own, no SSH stack, no docker socket — so a one-off container
// of the sandbox service standing in with `sleep infinity` is the whole
// harness: what the image alone delivers is all there is to assert.
describe('Dockerfile', () => {
  // The one-off container created below; compose exec resolves `run`
  // containers too.
  const container = 'sandbox-test-image'
  // The image tag declared by the Tests compose file.
  const image = 'docker-sandbox-templates-tests:latest'

  // The plainest exec surface: no --user, resolved purely by the image
  // itself — its USER (agent) and its ENV (the PATH hooks). The bash -c
  // wrapper only merges stderr for tools that print their version there
  // (kotlin, scala); bash has no long-form option for -c, and the wrapper
  // sources no init file of its own, so PATH resolution is identical to a
  // bare exec.
  const execBare = async (script: string) =>
    $`docker exec ${container} bash -c ${script}`.text().then((stdout) => stdout.trim())

  // The compose surface: explicit --user agent, the real consumer of
  // everything under /home/agent, where a mis-owned file fails as it would
  // in production.
  const execInSandbox = async (script: string) =>
    $`${compose} exec --user agent sandbox bash -c ${script}`.text().then((stdout) => stdout.trim())

  beforeAll(async () => {
    // Defensive teardown first: the afterAll guarantee does not cover SIGKILL.
    await $`docker rm --force --volumes ${container}`.nothrow().quiet()
    // The base image declares `tini --` as ENTRYPOINT and `claude ...` as
    // CMD; the override replaces that boot flow with a standing container
    // for inspection. There is no other service to keep out, so no --no-deps.
    await $`${compose} run --detach --name ${container} --entrypoint sleep sandbox infinity`
  }, 300_000)

  afterAll(async () => {
    await $`docker rm --force --volumes ${container}`.nothrow().quiet()
  }, 120_000)

  // The toolchains the multi-stage build bakes into /home/agent (bun, rust,
  // uv) and the system baseline (node). Versions pinned by a Dockerfile ARG
  // are asserted exactly — bumping the ARG without updating this suite must
  // fail — while everything that floats with the build is matched loosely.
  describe('baked toolchains', () => {
    test.each([
      ['bun --version', /^1\.4\.2$/], // BUN_VERSION
      ['rustc --version', /^rustc 1\.98\.1\b/], // RUST_VERSION
      ['cargo --version', /^cargo 1\.98\.1\b/], // rides the Rust toolchain
      ['node --version', /^v26\./], // NodeSource setup_26.x pins the major
    ])('%s is pinned by its Dockerfile ARG', async (command, expected) => {
      expect(await execBare(command)).toMatch(expected)
    })

    test.each([
      ['rustup --version', /^rustup \d/], // rustup's own release floats
      ['uv --version', /^uv \d+\.\d+/], // official installer: latest at build
      ['ruff --version', /^ruff \d+\.\d+/], // uv tool install: latest at build
      ['ty --version', /^ty \d+\.\d+/], // uv tool install: latest at build
      ['npm --version', /^\d+\.\d+/], // rides the NodeSource package
    ])('%s floats with the build', async (command, expected) => {
      expect(await execBare(command)).toMatch(expected)
    })

    // scratch-bun moves bun into ~/.local/bin and links bunx next to it.
    // command has no long form for -v.
    test('bunx resolves next to bun', async () => {
      expect(await execInSandbox('command -v bunx')).toBe('/home/agent/.local/bin/bunx')
    })
  })

  // Nix itself: pinned by NIX_VERSION, installed single-user with the
  // experimental features the profile tools need.
  describe('nix', () => {
    test('runs through the image ENV PATH hook via bare docker exec', async () => {
      // No shell, no --user: the plainest exec surface there is.
      const version = await $`docker exec ${container} nix --version`.text()
      expect(version.trim()).toBe('nix (Nix) 2.35.2') // NIX_VERSION
    })

    test('nix.conf enables flakes and disables the sandbox', async () => {
      const conf = await execInSandbox('cat ~/.config/nix/nix.conf')
      const lines = conf.split('\n').map((line) => line.trim())
      expect(lines).toContain('experimental-features = nix-command flakes')
      expect(lines).toContain('sandbox = false')
    })

    test('~/.nix-profile exists and points into the store', async () => {
      // readlink has no long options; -f resolves the whole chain.
      expect(await execInSandbox('readlink -f ~/.nix-profile')).toMatch(/^\/nix\/store\//)
    })
  })

  // The default Nix profile (scratch-nix): one row per package with a clean
  // version surface. Binary names differ from their nixpkgs packages —
  // gradle_9 -> gradle (the major survives the underscore), openjdk25 ->
  // java, maven -> mvn, ripgrep -> rg, yq-go -> yq (the Go implementation;
  // the mikefarah banner is its proof), phpPackages.composer -> composer.
  // kotlin and scala print their version to stderr and have no long-form
  // --version, hence `-version 2>&1`. Versions float with nixpkgs by
  // design — the Dockerfile pins no channel — so only the majors a package
  // name carries are pinned (java 25, gradle 9).
  describe('nix profile tools', () => {
    test.each([
      ['java --version', /^openjdk 25\b/],
      ['gradle --version', /Gradle 9\./],
      ['kotlin -version 2>&1', /Kotlin version \d+\.\d+/],
      ['mvn --version', /Apache Maven \d+/],
      ['quarkus --version', /^\d+\.\d+\.\d+$/],
      ['scala -version 2>&1', /Scala code runner version:? \d+\.\d+/],
      ['php --version', /^PHP \d+\.\d+/],
      ['composer --version', /Composer version \d+/],
      ['go version', /^go version go\d+\.\d+/],
      ['gh --version', /^gh version \d+/],
      ['git --version', /^git version \d+\.\d+/],
      ['glab --version', /^glab \d+/],
      ['jq --version', /^jq-\d+\.\d+/],
      ['rg --version', /^ripgrep \d+/],
      ['rsync --version', /^rsync\s+version \d+/],
      ['shellcheck --version', /version: \d+\.\d+/],
      ['yq --version', /mikefarah/],
      ['fnm --version', /^fnm \d+/],
      ['curl --version', /^curl \d+\.\d+/],
      ['wget --version', /^GNU Wget/],
      ['brotli --version', /^brotli \d/],
    ])('%s runs', async (command, expected) => {
      expect(await execBare(command)).toMatch(expected)
    })

    // The packages with no version surface worth pinning: command -v exits
    // non-zero when any named command is missing, so every tool resolving
    // at once is the check (bubblewrap -> bwrap).
    test('the quiet utilities resolve on PATH', async () => {
      const tools = 'nano htop unzip zip lz4 bwrap zstd'
      expect((await execBare(`command -v ${tools}`)).split('\n')).toHaveLength(7)
    })
  })

  // The final stage's ENV: the PATH hooks and the toolchain homes. The PATH
  // carries /home/agent/.local/bin twice — the final stage prepends its
  // hooks to a base PATH that already led with it; harmless (the shell
  // ignores repeats) and pinned here as-is.
  describe('environment', () => {
    test('PATH leads with the profile directories', async () => {
      const path = (await execInSandbox('printenv PATH')).split(':')
      expect(path.slice(0, 4)).toEqual([
        '/home/agent/.local/bin',
        '/home/agent/.nix-profile/bin',
        '/home/agent/.cargo/bin',
        '/home/agent/.local/bin', // the documented duplicate
      ])
    })

    // The static-config twin of the test above: the image's own ENV
    // declaration, read before any shell ever resolves a PATH.
    test('the image ENV declares the same PATH hooks', async () => {
      const template = '{{json .Config.Env}}'
      const envPairs = JSON.parse(await $`docker inspect --format ${template} ${image}`.text()) as string[]
      const pathPair = envPairs.find((pair) => pair.startsWith('PATH='))
      expect(pathPair).toStartWith(
        'PATH=/home/agent/.local/bin:/home/agent/.nix-profile/bin:/home/agent/.cargo/bin:/home/agent/.local/bin',
      )
    })

    // The seven defaults the final stage declares. UV_CACHE_DIR and
    // UV_NO_MODIFY_PATH belong to the scratch-uv stage only — they never
    // reach the final image, so nothing asserts them.
    test.each([
      ['BUN_INSTALL', '/home/agent/.local'],
      ['CARGO_HOME', '/home/agent/.cargo'],
      ['RUSTUP_HOME', '/home/agent/.rustup'],
      ['UV_COMPILE_BYTECODE', '1'],
      ['UV_MALWARE_CHECK', '1'],
      ['UV_PYTHON', '3.14'],
      ['UV_TORCH_BACKEND', 'cpu'],
    ])('%s keeps its default', async (name, expected) => {
      expect(await execInSandbox(`printenv ${name}`)).toBe(expected)
    })
  })

  // The final image copies the whole of /home/agent from the scratch stages
  // and re-chowns it: everything the agent owns must actually be owned by
  // the agent, and nothing group- or other-writable (symbolic links are
  // excluded: Linux gives every symlink mode 0777 and never consults those
  // bits, so they carry no writable-file risk).
  describe('files and permissions', () => {
    test("/home/agent is agent's home and is owned by agent", async () => {
      expect((await execInSandbox('getent passwd agent')).split(':')[5]).toBe('/home/agent')
      expect(await execInSandbox('stat --format=%U:%G /home/agent')).toBe('agent:agent')
    })

    // find's predicates are single characters; no long forms exist.
    test('nothing under /home/agent is group- or other-writable', async () => {
      expect(await execInSandbox('find /home/agent ! -type l -perm /go+w -print -quit')).toBe('')
    })
  })

  // The Base inheritance, guarded: the final stage builds FROM the base
  // image, so none of this is the Dockerfile's doing — but a later stage
  // accidentally declaring USER root or its own ENTRYPOINT would silently
  // regress the sandbox, and this is the only block that would notice.
  describe('base inheritance', () => {
    const inspectConfig = async (configPath: string) => {
      const template = `{{json .Config.${configPath}}}`
      return JSON.parse(await $`docker inspect --format ${template} ${image}`.text())
    }

    test('runs as the agent user', async () => {
      expect(await inspectConfig('User')).toBe('agent')
    })

    test('keeps the base tini entrypoint', async () => {
      expect(await inspectConfig('Entrypoint')).toEqual(['tini', '--'])
    })

    test('keeps claude as the default command', async () => {
      expect(await inspectConfig('Cmd')).toEqual(['claude', '--dangerously-skip-permissions'])
    })

    test('keeps the base working directory', async () => {
      expect(await inspectConfig('WorkingDir')).toBe('/home/agent/workspace')
    })
  })

  // The Base inheritance at runtime: the env loader the base wires through
  // BASH_ENV, and the claude CLI its CMD boots.
  describe('base contract at runtime', () => {
    test('BASH_ENV points at the base env loader', async () => {
      expect(await execBare('printenv BASH_ENV')).toBe('/etc/sandbox-persistent.sh')
    })

    test('the claude CLI resolves and reports its version', async () => {
      // Truly bare — no shell at all: the npm-global install the base PATH
      // carries is the whole resolution.
      const version = await $`docker exec ${container} claude --version`.text()
      expect(version.trim()).toMatch(/Claude Code/)
    })
  })

  // Binary names differ from their apt packages here too (build-essential
  // ships gcc/make). bash-completion ships no everyday binary; presence
  // goes through dpkg. The arch qualifier (:amd64/:arm64) rides along in
  // the package column.
  describe('system packages', () => {
    test.each(['node', 'xz'])('%s is on PATH', async (command) => {
      await execBare(`command -v ${command}`)
    })

    test.each(['bash-completion', 'build-essential', 'nodejs', 'xz-utils'])('package %s is installed', async (pkg) => {
      // dpkg-query exits non-zero (and throws here) when the package is
      // absent, so resolving at all is the check.
      expect(await execBare(`dpkg-query --show ${pkg}`)).toMatch(new RegExp(`^${pkg}(:\\S+)?\\s`))
    })
  })

  // scratch-bun generates the completion through `bun completions` into the
  // directory bash-completion reads. test's predicates are single
  // characters; no long forms exist.
  describe('completions', () => {
    test('the bun completion file exists', async () => {
      await execInSandbox('test -e ~/.local/share/bash-completion/completions/bun.completion.bash')
    })
  })
})
