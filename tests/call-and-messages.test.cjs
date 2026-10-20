const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteIceQueue, isPeerConnected } = require('../src/lib/callConnection.ts');
const { mergeMessages } = require('../src/lib/messageHistory.ts');

test('early ICE waits for remote SDP and flushes in arrival order', async () => {
  const added = [];
  const queue = createRemoteIceQueue(async candidate => { added.push(candidate); });
  await queue.add('first'); await queue.add('second');
  assert.deepEqual(added, []);
  await queue.remoteDescriptionSet();
  await queue.add('third');
  assert.deepEqual(added, ['first', 'second', 'third']);
});
test('closing a call drops queued and subsequent candidates', async () => {
  const added = [];
  const queue = createRemoteIceQueue(async candidate => { added.push(candidate); });
  await queue.add('early'); queue.close();
  await queue.remoteDescriptionSet(); await queue.add('late');
  assert.deepEqual(added, []);
});
test('one rejected ICE candidate does not poison subsequent deliveries', async () => {
  const added = [];
  const queue = createRemoteIceQueue(async candidate => {
    if (candidate === 'bad') throw Error('invalid candidate');
    added.push(candidate);
  });
  await queue.remoteDescriptionSet();
  await assert.rejects(queue.add('bad'));
  await queue.add('valid'); assert.deepEqual(added, ['valid']);
});
test('SDP exchange alone never means the media transport is connected', () => {
  assert.equal(isPeerConnected('connecting', 'checking'), false);
  assert.equal(isPeerConnected('new', 'new'), false);
  assert.equal(isPeerConnected('connecting', 'completed'), true);
  assert.equal(isPeerConnected('connected', 'connected'), true);
  assert.equal(isPeerConnected('failed', 'connected'), false);
});
const row = (id, seconds, deleted_at = null) => ({ id, created_at: `2026-10-20T00:00:0${seconds}Z`, deleted_at });
test('history response preserves newer live message and deduplicates sender response', () => {
  assert.deepEqual(mergeMessages([row('a', 1)], [row('a', 1), row('b', 2)]).map(x => x.id), ['a', 'b']);
});
test('out-of-order events are sorted and soft deletes win over fetched history', () => {
  assert.deepEqual(mergeMessages([row('a', 1), row('b', 2)], [row('c', 3), row('a', 1, 'deleted')]).map(x => x.id), ['b', 'c']);
});
