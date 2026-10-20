const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function audioFixture({ microphone = true, bluetooth = true } = {}) {
  const events = [];
  const manager = Object.fromEntries(['start', 'stop', 'setKeepScreenOn', 'setForceSpeakerphoneOn', 'setSpeakerphoneOn'].map(name => [name, (...args) => events.push([name, ...args])]));
  const native = {
    Platform: { OS: 'android', Version: 34 },
    PermissionsAndroid: {
      PERMISSIONS: { RECORD_AUDIO: 'mic', BLUETOOTH_CONNECT: 'bt' },
      RESULTS: { GRANTED: 'granted' },
      check: async () => false,
      request: async permission => (permission === 'mic' ? microphone : bluetooth) ? 'granted' : 'denied',
    },
  };
  const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/lib/callAudio.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, require(name) {
    if (name === 'react-native') return native;
    if (name === 'react-native-incall-manager') return { default: manager };
    if (name === 'expo-audio') return { setAudioModeAsync: async () => events.push(['fallback']) };
    throw Error('Unexpected dependency: ' + name);
  } });
  return { audio: exports, events };
}

test('microphone denial prevents starting native call audio', async () => {
  const { audio, events } = audioFixture({ microphone: false });
  await assert.rejects(audio.startVoiceAudio('direct'), /mikrofon/);
  assert.equal(events.length, 0);
});
test('Bluetooth denial still permits the built-in audio path', async () => {
  const { audio, events } = audioFixture({ bluetooth: false });
  await audio.startVoiceAudio('direct');
  assert.equal(events.filter(e => e[0] === 'start').length, 1);
  assert.ok(events.some(e => e[0] === 'setSpeakerphoneOn' && e[1] === false));
});
test('speaker selection is forced on and released for automatic headset routing', async () => {
  const { audio, events } = audioFixture();
  await audio.startVoiceAudio('direct');
  await audio.setVoiceSpeaker(true); await audio.setVoiceSpeaker(false);
  assert.ok(events.some(e => e[0] === 'setForceSpeakerphoneOn' && e[1] === true));
  assert.deepEqual(events.at(-2), ['setForceSpeakerphoneOn', null]);
});
test('leaving random-match screen cannot stop an active direct call audio session', async () => {
  const { audio, events } = audioFixture();
  await audio.startVoiceAudio('direct');
  await audio.stopVoiceAudio('random');
  assert.equal(events.filter(e => e[0] === 'stop').length, 0);
  await audio.stopVoiceAudio('direct');
  assert.equal(events.filter(e => e[0] === 'stop').length, 1);
});
