#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const repository = 'zarf.internal/casrep-command';
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const packageFiles = ['zarf.yaml', 'common', 'chart', 'config', 'zarf-values.yaml', 'zarf-values.schema.json',
  'bundle/uds-bundle.yaml', 'bundle/uds-config.yaml', 'docs/configuration.md', 'docs/dependencies.md'];
const buildFiles = [...packageFiles, 'index.html', 'frontend-config.js', '.dockerignore', 'backend/Dockerfile',
  'backend/go.mod', 'backend/go.sum', 'backend/cmd', 'backend/internal', 'backend/scripts', 'backend/data/seed.json'];

function digest(file) {
  const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(file, 'r');
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, bytes));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}
function sourceDigest(root) {
  const hash = crypto.createHash('sha256');
  function visit(relative) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) return; // go.sum is absent for the standard-library-only backend.
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Build input must not be a symlink: ${relative}`);
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    } else hash.update(relative).update('\0').update(digest(file)).update('\0');
  }
  buildFiles.forEach(visit);
  return hash.digest('hex');
}

function defaultRun(command, args, options) {
  return execFileSync(command, args, { cwd: options.cwd, input: options.input, encoding: 'utf8',
    stdio: options.capture ? ['pipe', 'pipe', 'inherit'] : 'inherit', maxBuffer: 16 * 1024 * 1024 });
}

function createPackager({ root = path.resolve(__dirname, '..'), architecture = process.env.ARCH || process.arch, run = defaultRun } = {}) {
  const architectures = { x64: 'amd64', amd64: 'amd64', arm64: 'arm64' };
  const arch = Object.hasOwn(architectures, architecture) ? architectures[architecture] : null;
  if (!arch) throw new Error(`Unsupported architecture: ${architecture}`);
  const buildRoot = path.join(root, '.build', arch);
  const stage = path.join(buildRoot, 'package');
  const artifacts = path.join(buildRoot, 'artifacts');
  const stateFile = path.join(buildRoot, 'build.json');
  const exec = (command, args, options = {}) => run(command, args, { cwd: root, ...options });
  const read = file => JSON.parse(exec('uds', ['zarf', 'tools', 'yq', '-o=json', '.', file], { capture: true }));
  function write(file, value) {
    const yaml = exec('uds', ['zarf', 'tools', 'yq', '-p=json', '-o=yaml', '-P', '.'], { input: JSON.stringify(value), capture: true });
    fs.writeFileSync(file, yaml);
  }
  function version() {
    const value = read(path.join(root, 'zarf.yaml')).metadata.version;
    if (!semver.test(value)) throw new Error(`Package version must be x.y.z, received ${value}`);
    return value;
  }
  function checkVersions() {
    const value = version();
    for (const name of ['chart', 'config']) {
      const chart = read(path.join(root, name, 'Chart.yaml'));
      if (chart.version !== value || chart.appVersion !== value) throw new Error(`Version drift in ${name}/Chart.yaml; use uds run set-version --set VERSION=x.y.z`);
    }
    const definition = read(path.join(root, 'zarf.yaml'));
    const bundle = read(path.join(root, 'bundle/uds-bundle.yaml'));
    const image = read(path.join(root, 'chart/values.yaml')).image;
    if (bundle.metadata.version !== value || bundle.packages[0].ref !== value || image.tag !== value ||
        definition.components.length !== 1 || definition.components[0].imageArchives[0].images[0] !== `${repository}:${value}`) {
      throw new Error('One package component, bundle, and chart image must use the same version');
    }
    return value;
  }
  function save(state) {
    fs.writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2) + '\n');
    fs.renameSync(stateFile + '.tmp', stateFile);
  }
  function load() {
    if (!fs.existsSync(stateFile)) throw new Error('No prepared build; run uds run create-test-bundle or uds run dev');
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (state.arch !== arch || state.version !== checkVersions() || state.sourceSha256 !== sourceDigest(root)) throw new Error('Source changed since preparation; rebuild with uds run create-test-bundle or uds run dev');
    if (state.manifestSha256 !== sourceDigest(stage)) throw new Error('Prepared manifests changed; rebuild instead of deploying a stale archive');
    return state;
  }
  function requireArtifact(file, expected) {
    if (!expected || !fs.existsSync(file) || digest(file) !== expected) throw new Error(`Missing or changed artifact: ${file}; rebuild instead of deploying a stale archive`);
  }
  function setVersion(next = process.env.VERSION) {
    const current = version();
    if (!semver.test(next)) throw new Error('Set VERSION to a numeric x.y.z version');
    const previous = current.split('.').map(Number), target = next.split('.').map(Number);
    const different = target.findIndex((part, i) => part !== previous[i]);
    if (different < 0 || target[different] < previous[different]) throw new Error(`New version must be greater than ${current}`);
    const updates = [
      ['zarf.yaml', doc => { doc.metadata.version = next; doc.components[0].imageArchives[0].images = [`${repository}:${next}`]; }],
      ['chart/Chart.yaml', doc => { doc.version = next; doc.appVersion = next; }],
      ['config/Chart.yaml', doc => { doc.version = next; doc.appVersion = next; }],
      ['chart/values.yaml', doc => { doc.image.tag = next; }],
      ['bundle/uds-bundle.yaml', doc => { doc.metadata.version = next; doc.packages[0].ref = next; }]
    ].map(([file, update]) => { const full = path.join(root, file), doc = read(full); update(doc); return [full, doc]; });
    updates.forEach(([file, doc]) => write(file, doc));
    return next;
  }
  function prepare() {
    const value = checkVersions();
    fs.mkdirSync(buildRoot, { recursive: true });
    fs.rmSync(stateFile, { force: true }); // A failed build must not leave a deployable old state.
    const sourceSha256 = sourceDigest(root);
    const temporaryImage = `${repository}:${value}-build`;
    exec('docker', ['buildx', 'build', `--platform=linux/${arch}`, '--load', '--tag', temporaryImage, '--file', 'backend/Dockerfile', '.']);
    const imageId = exec('docker', ['image', 'inspect', temporaryImage, '--format', '{{.Id}}'], { capture: true }).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('Docker did not return a SHA-256 image ID');
    const tag = `${value}-${imageId.slice(7)}`, image = `${repository}:${tag}`;
    exec('docker', ['tag', imageId, image]);
    // Only this helper owns this generated directory. Never include old package archives.
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    for (const relative of packageFiles) {
      const target = path.join(stage, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(root, relative), target, { recursive: true });
    }
    const definition = read(path.join(stage, 'zarf.yaml'));
    definition.components[0].imageArchives[0].images = [image];
    write(path.join(stage, 'zarf.yaml'), definition);
    const values = read(path.join(stage, 'chart/values.yaml'));
    values.image = { ...values.image, repository, tag };
    write(path.join(stage, 'chart/values.yaml'), values);
    const bundle = read(path.join(stage, 'bundle/uds-bundle.yaml'));
    bundle.packages[0].path = '../../artifacts';
    write(path.join(stage, 'bundle/uds-bundle.yaml'), bundle);
    fs.mkdirSync(path.join(stage, 'images'));
    const archive = path.join(stage, 'images/casrep-command.tar');
    exec('docker', ['save', '--output', archive, image]);
    if (sourceSha256 !== sourceDigest(root)) throw new Error('Source changed during the image build; run preparation again');
    const state = { version: value, arch, image, imageId, sourceSha256, manifestSha256: sourceDigest(stage),
      archiveSha256: digest(archive), htmlSha256: digest(path.join(root, 'index.html')),
      packagePath: path.join(artifacts, `zarf-package-casrep-command-${arch}-${value}.tar.zst`),
      bundlePath: path.join(artifacts, `uds-bundle-casrep-command-test-${arch}-${value}.tar.zst`) };
    save(state);
    return state;
  }
  function createPackage() {
    const state = load();
    requireArtifact(path.join(stage, 'images/casrep-command.tar'), state.archiveSha256);
    delete state.packageSha256; delete state.bundleSha256; save(state);
    fs.mkdirSync(artifacts, { recursive: true });
    exec('uds', ['zarf', 'dev', 'lint', stage]);
    exec('uds', ['zarf', 'package', 'create', stage, '--output', artifacts, '--architecture', arch, '--skip-sbom', '--confirm', '--no-color']);
    state.packageSha256 = digest(state.packagePath); save(state);
    return state;
  }
  function createBundle() {
    const state = load(); requireArtifact(state.packagePath, state.packageSha256);
    delete state.bundleSha256; save(state);
    exec('uds', ['create', path.join(stage, 'bundle'), '--output', artifacts, '--architecture', arch, '--confirm', '--no-color']);
    state.bundleSha256 = digest(state.bundlePath); save(state);
    return state;
  }
  function deploy() {
    const state = load(); requireArtifact(state.bundlePath, state.bundleSha256);
    exec('uds', ['deploy', state.bundlePath, '--architecture', arch, '--confirm', '--no-progress']);
    return state;
  }
  function verify() {
    const state = load(); requireArtifact(state.bundlePath, state.bundleSha256);
    exec('uds', ['zarf', 'tools', 'kubectl', 'rollout', 'status', 'deployment/casrep-command', '-n', 'casrep-command', '--timeout=180s']);
    const output = exec('uds', ['zarf', 'tools', 'kubectl', 'exec', '-n', 'casrep-command', 'deploy/casrep-command', '-c', 'casrep-command', '--', 'sha256sum', '/app/static/index.html'], { capture: true });
    if (output.trim().split(/\s+/)[0] !== state.htmlSha256) throw new Error(`Running UI does not match this build (expected ${state.htmlSha256})`);
    return state;
  }
  return { version, checkVersions, setVersion, prepare, package: createPackage, bundle: createBundle, deploy, verify };
}

module.exports = { createPackager, sourceDigest };
if (require.main === module) {
  try {
    const packager = createPackager();
    const command = { 'set-version': 'setVersion', 'check-version': 'checkVersions' }[process.argv[2]] || process.argv[2];
    if (!Object.hasOwn(packager, command)) throw new Error('Usage: package-build.cjs prepare|package|bundle|deploy|verify|version|check-version|set-version');
    const result = packager[command]();
    console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
