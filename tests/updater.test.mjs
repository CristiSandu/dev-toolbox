import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppUpdater, downloadPercent } from '../src/features/updater/app-updater.ts';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function available(overrides = {}) {
  return { version: '0.2.1', body: 'Fixes and improvements', close: async () => {}, downloadAndInstall: async () => {}, ...overrides };
}

test('checking is serialized and publishes availability without installing', async () => {
  const gate = deferred();
  let calls = 0;
  let installs = 0;
  const update = available({ downloadAndInstall: async () => { installs++; } });
  const updater = createAppUpdater({ check: () => { calls++; return gate.promise; }, relaunch: async () => {} });
  const pending = updater.check();
  assert.equal(updater.getSnapshot().status, 'checking');
  assert.equal(await updater.check(), null);
  gate.resolve(update);
  assert.deepEqual(await pending, { version: '0.2.1', body: 'Fixes and improvements' });
  assert.equal(updater.getSnapshot().status, 'available');
  assert.equal(calls, 1);
  assert.equal(installs, 0);
});

test('checks recover from offline errors and release replaced native resources', async () => {
  let attempt = 0;
  let closed = 0;
  const update = available({ close: async () => { closed++; } });
  const updater = createAppUpdater({
    check: async () => {
      attempt++;
      if (attempt === 1) throw 'Network unavailable';
      return attempt === 2 ? update : null;
    },
    relaunch: async () => {},
  });
  await updater.check();
  assert.equal(updater.getSnapshot().failedAction, 'check');
  assert.equal(updater.getSnapshot().error, 'Network unavailable');
  await updater.check();
  assert.equal(updater.getSnapshot().status, 'available');
  await updater.check();
  assert.equal(updater.getSnapshot().status, 'up-to-date');
  assert.equal(closed, 1);
});

test('download progress handles missing sizes and installation/restart stay serialized', async () => {
  const gate = deferred();
  let onEvent;
  let installs = 0;
  let restarts = 0;
  const update = available({ downloadAndInstall: (callback, options) => {
    onEvent = callback;
    installs++;
    assert.equal(options.timeout, 120_000);
    return gate.promise;
  } });
  const updater = createAppUpdater({ check: async () => update, relaunch: async () => { restarts++; } });
  await updater.check();
  const pending = updater.install();
  await updater.install();
  assert.equal(await updater.check(), null);
  onEvent({ event: 'Started', data: {} });
  onEvent({ event: 'Progress', data: { chunkLength: 10 } });
  assert.equal(updater.getSnapshot().downloaded, 10);
  assert.equal(downloadPercent(updater.getSnapshot()), undefined);
  onEvent({ event: 'Started', data: { contentLength: 100 } });
  onEvent({ event: 'Progress', data: { chunkLength: 40 } });
  assert.equal(downloadPercent(updater.getSnapshot()), 40);
  onEvent({ event: 'Finished' });
  assert.equal(updater.getSnapshot().status, 'installing');
  assert.equal(restarts, 0);
  gate.resolve();
  await pending;
  assert.equal(installs, 1);
  assert.equal(restarts, 1);
  assert.equal(updater.getSnapshot().status, 'restarting');
  await updater.check();
  await updater.install();
  assert.equal(installs, 1);
});

test('failed download or signature verification never relaunches and can be retried', async () => {
  let attempts = 0;
  let restarts = 0;
  const update = available({ downloadAndInstall: async () => {
    if (++attempts === 1) throw new Error('Invalid signature');
  } });
  const updater = createAppUpdater({ check: async () => update, relaunch: async () => { restarts++; } });
  await updater.check();
  await updater.install();
  assert.equal(updater.getSnapshot().status, 'error');
  assert.equal(updater.getSnapshot().failedAction, 'install');
  assert.equal(updater.getSnapshot().error, 'Invalid signature');
  assert.equal(restarts, 0);
  await updater.install();
  assert.equal(attempts, 2);
  assert.equal(restarts, 1);
});

test('a relaunch failure allows restart retry without reinstalling or rechecking', async () => {
  let installs = 0;
  let restarts = 0;
  let checks = 0;
  const updater = createAppUpdater({
    check: async () => { checks++; return available({ downloadAndInstall: async () => { installs++; } }); },
    relaunch: async () => { if (++restarts === 1) throw new Error('Restart failed'); },
  });
  await updater.check();
  await updater.install();
  assert.equal(updater.getSnapshot().status, 'restart-required');
  assert.equal(updater.getSnapshot().error, 'Restart failed');
  await updater.install();
  await updater.check();
  await updater.restart();
  assert.equal(installs, 1);
  assert.equal(checks, 1);
  assert.equal(restarts, 2);
  assert.equal(updater.getSnapshot().status, 'restarting');
});

test('subscriptions can be removed and download percentages stay bounded', async () => {
  const updater = createAppUpdater({ check: async () => null, relaunch: async () => {} });
  let notifications = 0;
  const unsubscribe = updater.subscribe(() => { notifications++; });
  await updater.check();
  assert.equal(notifications, 2);
  unsubscribe();
  await updater.check();
  assert.equal(notifications, 2);
  assert.equal(downloadPercent({ total: 10, downloaded: 20 }), 100);
  assert.equal(downloadPercent({ total: 0, downloaded: 20 }), undefined);
});
