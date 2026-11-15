const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

async function fixture(count = 30, stored = null) {
  const notices = [], writes = [], detachedTypes = [], events = new Map();
  let disk = stored, inflight = 0, maxInflight = 0, failNext = false;
  class Plugin {
    constructor(app) { this.app = app; this.disposers = []; }
    async loadData() { return disk === null ? null : clone(disk); }
    async saveData(data) {
      inflight++; maxInflight = Math.max(maxInflight, inflight);
      await new Promise(resolve => setTimeout(resolve, 1));
      inflight--;
      if (failNext) { failNext = false; throw new Error('Simulated write failure'); }
      disk = clone(data); writes.push(clone(data));
    }
    registerView(type, create) { this.viewFactory = create; }
    addRibbonIcon() {}
    addCommand() {}
    registerEvent() {}
    register(dispose) { this.disposers.push(dispose); }
  }
  const api = { Plugin, ItemView: class {}, Modal: class {}, Menu: class {}, Notice: class { constructor(message) { notices.push(message); } }, setIcon() {} };
  const sandbox = { require(name) { assert.equal(name, 'obsidian'); return api; }, module: { exports: {} }, setTimeout, clearTimeout, console: { error() {} } };
  vm.runInNewContext(source, sandbox, { filename: 'main.js' });
  const leaves = Array.from({ length: count }, (_, i) => {
    const state = { cwd: '/vault/shared' };
    Object.defineProperty(state, 'serial', { enumerable: true, get() { throw new Error('Terminal scrollback must not be read'); } });
    return { id: `leaf-${i}`, view: {
      state, emulator: {}, focusCalls: 0,
      getViewType() { return 'terminal:terminal'; },
      getState() { throw new Error('Terminal getState must not be called'); },
      setState() { throw new Error('Terminal must not be reconfigured'); },
      startEmulator() { throw new Error('Terminal must not be restarted'); },
      focus() { this.focusCalls++; }
    }, setViewState() { throw new Error('Existing terminal must not be replaced'); }, detach() { throw new Error('Terminal must not be closed'); } };
  });
  const workspace = {
    activeLeaf: leaves[0],
    getLeavesOfType(type) { return type === 'terminal:terminal' ? leaves : []; },
    on(name, callback) { events.set(name, callback); return {}; },
    onLayoutReady(callback) { this.ready = callback; },
    async revealLeaf(leaf) { assert.ok(leaves.includes(leaf)); },
    setActiveLeaf(leaf) { this.activeLeaf = leaf; },
    detachLeavesOfType(type) { detachedTypes.push(type); }
  };
  const plugin = new sandbox.module.exports({ workspace });
  await plugin.onload();
  plugin.refresh();
  await plugin.saveQueue;
  return { plugin, leaves, workspace, writes, notices, detachedTypes, events, disk: () => clone(disk), maxInflight: () => maxInflight, fail: () => { failNext = true; } };
}

test('30 terminals sharing a folder retain independent aliases when reordered or closed', async () => {
  const f = await fixture();
  assert.equal(f.plugin.sessions.length, 30);
  assert.equal(new Set(f.plugin.sessions.map(s => s.id)).size, 30);
  await f.plugin.renameSession('leaf-0', '项目 A 审稿');
  await f.plugin.renameSession('leaf-1', '项目 B 实验');
  await f.plugin.moveSession('leaf-1', 'research');
  f.leaves.reverse(); f.plugin.refresh();
  assert.equal(f.plugin.sessions.find(s => s.id === 'leaf-0').name, '项目 A 审稿');
  assert.equal(f.plugin.sessions.find(s => s.id === 'leaf-1').name, '项目 B 实验');
  f.leaves.splice(f.leaves.findIndex(l => l.id === 'leaf-0'), 1); f.plugin.refresh();
  assert.equal(f.plugin.sessions.length, 29);
  assert.equal(f.plugin.sessions.find(s => s.id === 'leaf-1').groupId, 'research');
  assert.equal(f.plugin.data.sessions['leaf-0'].name, '项目 A 审稿');
});

test('rapid edits save in order and restore aliases, groups and folds on the same leaf ids', async () => {
  const f = await fixture(3);
  f.plugin.renameSession('leaf-0', '旧名称');
  f.plugin.renameSession('leaf-0', '新名称');
  f.plugin.moveSession('leaf-0', 'simple');
  f.plugin.toggleGroup('simple');
  f.plugin.toggleGroup('');
  await f.plugin.saveQueue;
  assert.equal(f.maxInflight(), 1);
  const restored = await fixture(3, f.disk());
  assert.equal(restored.plugin.sessions[0].name, '新名称');
  assert.equal(restored.plugin.sessions[0].groupId, 'simple');
  assert.equal(restored.plugin.data.groups.find(g => g.id === 'simple').collapsed, true);
  assert.equal(restored.plugin.data.ungroupedCollapsed, true);
});

test('switching focuses the original terminal instance and handles a stale closed row', async () => {
  const f = await fixture(5);
  const views = f.leaves.map(l => l.view), emulators = f.leaves.map(l => l.view.emulator);
  assert.equal(await f.plugin.focusSession('leaf-3'), true);
  assert.equal(f.workspace.activeLeaf, f.leaves[3]);
  assert.equal(f.leaves[3].view.focusCalls, 1);
  assert.ok(f.leaves.every((l, i) => l.view === views[i] && l.view.emulator === emulators[i]));
  f.leaves.splice(3, 1);
  assert.equal(await f.plugin.focusSession('leaf-3'), false);
  assert.equal(f.plugin.sessions.length, 4);
  assert.ok(f.notices.some(n => n.includes('已经关闭')));
});

test('removing a group returns live and closed entries to ungrouped without changing terminals', async () => {
  const f = await fixture(3);
  const id = f.plugin.createGroup('项目 A').id;
  assert.ok(id);
  assert.ok(f.plugin.createGroup('项目 a').error);
  await f.plugin.moveSession('leaf-0', id);
  await f.plugin.moveSession('leaf-1', id);
  f.leaves.splice(1, 1); f.plugin.refresh();
  f.plugin.deleteGroup(id);
  await f.plugin.saveQueue;
  assert.equal(f.plugin.data.sessions['leaf-0'].groupId, '');
  assert.equal(f.plugin.data.sessions['leaf-1'].groupId, '');
  assert.equal(f.leaves.length, 2);
  assert.ok(!f.plugin.data.groups.some(g => g.id === id));
});

test('a failed disk write is reported and does not poison subsequent saves', async () => {
  const f = await fixture(1);
  f.fail();
  assert.equal(await f.plugin.renameSession('leaf-0', '未保存'), false);
  assert.ok(f.notices.some(n => n.includes('暂未保存')));
  assert.equal(await f.plugin.renameSession('leaf-0', '已保存'), true);
  assert.equal(f.disk().sessions['leaf-0'].name, '已保存');
});

test('unloading detaches only the navigator and leaves all terminal objects intact', async () => {
  const f = await fixture(13);
  const original = [...f.leaves];
  f.plugin.scheduleRefresh();
  f.plugin.onunload();
  for (const dispose of f.plugin.disposers) dispose();
  assert.deepEqual(f.detachedTypes, ['terminal-session-navigator-view']);
  assert.equal(f.leaves.length, 13);
  assert.ok(f.leaves.every((l, i) => l === original[i]));
});

test('unrecognized groups and invalid stored ordinals recover without mixing sessions', async () => {
  const f = await fixture(2, { groups: [{ id: 'r', name: '科研' }, { id: 'r', name: '重复' }], sessions: { 'leaf-0': { name: ' A\nB ', groupId: 'missing', ordinal: -3 }, 'leaf-1': { name: '独立', groupId: 'r', ordinal: 8 } } });
  assert.equal(f.plugin.data.groups.length, 1);
  assert.equal(f.plugin.sessions[0].name, 'A B');
  assert.equal(f.plugin.sessions[0].groupId, '');
  assert.equal(f.plugin.sessions[1].groupId, 'r');
  assert.equal(f.plugin.data.nextOrdinal, 9);
});
