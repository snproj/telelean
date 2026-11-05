/**
 * The bwrap mount allowlist for every Lean-family process (03 §8.4 `runLean`, 02 D-24).
 *
 * Pure: builds argv only, so the profile can be unit-tested and reviewed in one place.
 */
import path from 'node:path';

export interface SandboxProfile {
  /** The real `$HOME`. It is covered by an empty tmpfs inside the sandbox; `HOME` still points at it. */
  readonly home: string;
  /** `~/.elan` (holds the toolchain). Bound read-only. */
  readonly elanHome: string;
  /** The toolchain's `bin/`, put first on `PATH` so nothing resolves through the elan proxies. */
  readonly toolchainBin: string;
  /** The shadow project. Sources read-only; only `<shadow>/.lake` is writable. Also the working directory. */
  readonly shadowDir: string;
  /** The real project's `.lake/packages`, bound read-only at `<shadow>/.lake/packages` (absent: nothing bound). */
  readonly packagesDir?: string | undefined;
  /** Extra paths bound read-only at the same path (e.g. the extractor's directory, a frozen export). */
  readonly roBinds?: readonly string[] | undefined;
  /** Extra paths bound writable at the same path (e.g. the extractor's one-time compile directory). */
  readonly rwBinds?: readonly string[] | undefined;
  /** Paths covered by an empty tmpfs after the shadow is bound (e.g. a real workspace's `.git`). */
  readonly maskPaths?: readonly string[] | undefined;
  /**
   * Create `/root`, `/run/user` and `/var`, which `lake comparator`'s own nested bwrap needs as mount
   * points. Without them every comparator verdict would fail to start (verifier FV-2). Default true;
   * turning it off exists only so a test can show that failure is reported as "could not start".
   */
  readonly allowNestedSandbox?: boolean | undefined;
  /** Environment inside the sandbox, on top of `HOME` and `PATH` (which cannot be overridden). */
  readonly env?: Readonly<Record<string, string>> | undefined;
  /** File descriptor bwrap reports its JSON status on (`child-pid`, `exit-code`). */
  readonly jsonStatusFd?: number | undefined;
}

/** `PATH` inside the sandbox: the toolchain first, then the system. */
export function sandboxPath(toolchainBin: string): string {
  return `${toolchainBin}:/usr/bin:/bin`;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertAbsolute(what: string, p: string): void {
  if (!path.isAbsolute(p)) throw new TypeError(`${what} must be an absolute path, got ${JSON.stringify(p)}`);
  if (p.includes('\0')) throw new TypeError(`${what} contains a NUL byte`);
}

/**
 * Builds the bwrap arguments (without the `bwrap` executable itself) that run `argv` under the profile.
 *
 * Order matters: bwrap applies mounts in order, so the tmpfs covers come before the binds that punch
 * through them (`~/.elan` lives under the masked `$HOME`; the shadow may live under `/tmp` or `$HOME`).
 */
export function buildBwrapArgs(profile: SandboxProfile, argv: readonly string[]): string[] {
  if (argv.length === 0) throw new TypeError('argv must not be empty');
  assertAbsolute('home', profile.home);
  assertAbsolute('elanHome', profile.elanHome);
  assertAbsolute('toolchainBin', profile.toolchainBin);
  assertAbsolute('shadowDir', profile.shadowDir);
  if (profile.packagesDir !== undefined) assertAbsolute('packagesDir', profile.packagesDir);
  for (const p of profile.roBinds ?? []) assertAbsolute('roBinds entry', p);
  for (const p of profile.rwBinds ?? []) assertAbsolute('rwBinds entry', p);
  for (const p of profile.maskPaths ?? []) assertAbsolute('maskPaths entry', p);

  const shadow = path.resolve(profile.shadowDir);
  const dotLake = path.join(shadow, '.lake');
  const args: string[] = [
    // System, read-only. Merged-/usr layout: /lib, /lib64 and /bin are symlinks into /usr.
    '--ro-bind', '/usr', '/usr',
    '--ro-bind', '/etc', '/etc',
    '--symlink', 'usr/lib', '/lib',
    '--symlink', 'usr/lib64', '/lib64',
    '--symlink', 'usr/bin', '/bin',
    '--proc', '/proc',
    '--dev', '/dev',
    // Fresh, empty filesystems: no host /tmp, no host /run (D-Bus, keyring, Wayland), no host $HOME.
    '--tmpfs', '/tmp',
    '--tmpfs', '/run',
    '--tmpfs', profile.home,
  ];
  if (profile.allowNestedSandbox ?? true) {
    args.push('--dir', '/root', '--dir', '/run/user', '--dir', '/var');
  }
  args.push('--ro-bind', profile.elanHome, profile.elanHome);
  for (const p of profile.roBinds ?? []) args.push('--ro-bind', p, p);
  args.push('--ro-bind', shadow, shadow, '--bind', dotLake, dotLake);
  if (profile.packagesDir !== undefined) {
    args.push('--ro-bind', profile.packagesDir, path.join(dotLake, 'packages'));
  }
  for (const p of profile.rwBinds ?? []) args.push('--bind', p, p);
  for (const p of profile.maskPaths ?? []) args.push('--tmpfs', p);
  args.push(
    '--chdir', shadow,
    '--unshare-all', // user, ipc, pid, net (loopback only), uts, cgroup
    '--die-with-parent',
    '--new-session',
    '--clearenv',
    '--setenv', 'HOME', profile.home,
    '--setenv', 'PATH', sandboxPath(profile.toolchainBin),
  );
  for (const [name, value] of Object.entries(profile.env ?? {})) {
    if (!ENV_NAME.test(name)) throw new TypeError(`invalid environment variable name ${JSON.stringify(name)}`);
    if (name === 'HOME' || name === 'PATH') throw new TypeError(`${name} is fixed by the sandbox profile`);
    args.push('--setenv', name, value);
  }
  if (profile.jsonStatusFd !== undefined) args.push('--json-status-fd', String(profile.jsonStatusFd));
  args.push('--', ...argv);
  return args;
}
