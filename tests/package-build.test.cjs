'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPackager } = require('../scripts/package-build.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Exercise the real orchestration and filesystem with deterministic Docker/UDS
// boundaries. Fixtures use JSON, which is valid YAML, so CI needs no YAML library.
function fixture(t, architecture = 'amd64') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'casrep-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = 'zarf.internal/casrep-command', version = '0.1.1';
  const files = {
    'index.html': '<p>Older UI</p>', 'frontend-config.js': '', '.dockerignore': '.build',
    'backend/Dockerfile': 'COPY index.html /app/static/',
    'zarf.yaml': { metadata: { name: 'casrep-command', version }, components: [{ name: 'casrep-command', imageArchives: [{ path: 'images/casrep-command.tar', images: [repo + ':' + version] }] }] },
    'common/zarf.yaml': { components: [{ name: 'casrep-command', charts: [] }] },
    'chart/Chart.yaml': { version, appVersion: version }, 'config/Chart.yaml': { version, appVersion: version },
    'chart/values.yaml': { image: { repository: repo, tag: version, pullPolicy: 'IfNotPresent' } },
    'bundle/uds-bundle.yaml': { metadata: { name: 'casrep-command-test', version }, packages: [{ name: 'casrep-command', path: '../', ref: version }] },
    'bundle/uds-config.yaml': {}, 'zarf-values.yaml': {}, 'zarf-values.schema.json': {},
    'docs/configuration.md': '# Configuration\n', 'docs/dependencies.md': '# Dependencies\n'
  };
  const write = (file, value) => { const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value)); };
  Object.entries(files).forEach(([file, value]) => write(file, value));
  const state = { root, write, calls: [], fail: null, runningHash: null };
  const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const option = (args, flag) => args[args.indexOf(flag) + 1];
  function run(command, args, options) {
    state.calls.push([command, ...args]);
    if (state.fail && [command, ...args].join(' ').startsWith(state.fail)) throw new Error('simulated command failure');
    if (command === 'uds' && args[2] === 'yq') return args.includes('-p=json') ? options.input + '\n' : fs.readFileSync(args.at(-1), 'utf8');
    if (command === 'docker') {
      if (args[0] === 'buildx') state.imageId = 'sha256:' + hash(fs.readFileSync(path.join(root, 'index.html')));
      if (args[0] === 'image') return state.imageId + '\n';
      if (args[0] === 'save') fs.writeFileSync(option(args, '--output'), JSON.stringify({ image: args.at(-1), html: fs.readFileSync(path.join(root, 'index.html'), 'utf8') }));
      return '';
    }
    if (args[0] === 'zarf' && args[1] === 'package') {
      const stage = args[3], definition = read(path.join(stage, 'zarf.yaml'));
      const artifact = path.join(option(args, '--output'), `zarf-package-casrep-command-${option(args, '--architecture')}-${definition.metadata.version}.tar.zst`);
      fs.writeFileSync(artifact, JSON.stringify({ definition, values: read(path.join(stage, 'chart/values.yaml')) }));
    }
    if (args[0] === 'create') {
      const bundle = read(path.join(args[1], 'uds-bundle.yaml'));
      const packagePath = path.resolve(args[1], bundle.packages[0].path, `zarf-package-casrep-command-${option(args, '--architecture')}-${bundle.packages[0].ref}.tar.zst`);
      assert.ok(fs.existsSync(packagePath), 'bundle must resolve the exact newly built package');
      fs.writeFileSync(path.join(option(args, '--output'), `uds-bundle-casrep-command-test-${option(args, '--architecture')}-${bundle.metadata.version}.tar.zst`), JSON.stringify({ bundle, package: read(packagePath) }));
    }
    if (args[0] === 'deploy') state.runningHash = hash(fs.readFileSync(path.join(root, 'index.html')));
    if (args[2] === 'kubectl' && args[3] === 'exec') return `${state.runningHash}  /app/static/index.html\n`;
    return '';
  }
  state.packager = createPackager({ root, architecture, run });
  state.fullBuild = () => { state.packager.prepare(); state.packager.package(); return state.packager.bundle(); };
  return state;
}

for (const architecture of ['amd64', 'arm64']) {
  test(`${architecture}: UI changes change the packaged/deployed image without changing the package version`, t => {
    const f = fixture(t, architecture), first = f.fullBuild();
    f.packager.deploy(); f.packager.verify();
    f.write('index.html', '<p>Larger, accessible UI</p>');
    const second = f.fullBuild();
    assert.notEqual(second.image, first.image);
    assert.equal(second.version, '0.1.1');
    const bundle = JSON.parse(fs.readFileSync(second.bundlePath));
    assert.deepEqual(bundle.package.definition.components[0].imageArchives[0].images, [second.image]);
    assert.equal(bundle.package.values.image.repository + ':' + bundle.package.values.image.tag, second.image);
    assert.equal(bundle.bundle.packages[0].ref, second.version);
    assert.ok(f.calls.some(call => call.includes(`--platform=linux/${architecture}`)));
    assert.ok(f.calls.every(call => !call.includes('--flavor')));
    assert.ok(second.bundlePath.includes(`-${architecture}-0.1.1.tar.zst`));
    f.packager.deploy(); f.packager.verify();
    assert.equal(f.fullBuild().image, second.image, 'unchanged image bytes keep their identity');
  });
}

test('source edits and prepared-manifest edits block stale deployment', t => {
  const f = fixture(t); f.fullBuild();
  f.write('index.html', 'Changed after packaging');
  assert.throws(() => f.packager.deploy(), /Source changed/);
  f.fullBuild();
  f.write('.build/amd64/package/chart/values.yaml', { image: { tag: 'old' } });
  assert.throws(() => f.packager.deploy(), /Prepared manifests changed/);
  assert.ok(!f.calls.some(call => call[1] === 'deploy'));
});

test('failed rebuild cannot fall back to a previous successful package', t => {
  const f = fixture(t); f.fullBuild();
  f.fail = 'docker buildx';
  assert.throws(() => f.packager.prepare(), /simulated command failure/);
  assert.throws(() => f.packager.deploy(), /No prepared build/);
});

test('failed package creation invalidates previous bundle identity', t => {
  const f = fixture(t); f.fullBuild();
  f.fail = 'uds zarf package';
  assert.throws(() => f.packager.package(), /simulated command failure/);
  assert.throws(() => f.packager.deploy(), /Missing or changed artifact/);
});

test('missing or replaced package/bundle archives are rejected', t => {
  const f = fixture(t), state = f.fullBuild();
  fs.appendFileSync(state.packagePath, 'stale');
  assert.throws(() => f.packager.bundle(), /Missing or changed artifact/);
  f.fullBuild(); fs.appendFileSync(state.bundlePath, 'stale');
  assert.throws(() => f.packager.deploy(), /Missing or changed artifact/);
});

test('verification catches a successful rollout serving old HTML', t => {
  const f = fixture(t); f.fullBuild(); f.packager.deploy();
  f.runningHash = '0'.repeat(64);
  assert.throws(() => f.packager.verify(), /Running UI does not match this build/);
});

test('version bumps are monotonic and synchronize all package identities', t => {
  const f = fixture(t);
  for (const value of ['dev', '0.1.0', '0.1.1', '01.2.3', 'v0.1.2', undefined]) assert.throws(() => f.packager.setVersion(value));
  assert.equal(f.packager.checkVersions(), '0.1.1');
  assert.equal(f.packager.setVersion('0.1.2'), '0.1.2');
  assert.equal(f.packager.checkVersions(), '0.1.2');
  assert.ok(f.fullBuild().packagePath.endsWith('-0.1.2.tar.zst'));
  f.write('chart/Chart.yaml', { version: '0.1.0', appVersion: '0.1.0' });
  assert.throws(() => f.packager.prepare(), /Version drift/);
});

test('old root archives and mutable runtime data are excluded from build inputs', t => {
  const f = fixture(t); f.fullBuild();
  f.write('bundle/uds-bundle-casrep-command-test-amd64-dev.tar.zst', 'stale');
  f.write('backend/data/anchor-management.json', 'live data is not an image input');
  f.packager.deploy();
  assert.ok(!fs.existsSync(path.join(f.root, '.build/amd64/package/bundle/uds-bundle-casrep-command-test-amd64-dev.tar.zst')));
});
