import test from 'node:test';
import assert from 'node:assert/strict';
import { promptFeatures, editLines, shellFailed, simhash, hamming, DUPLICATE_BITS } from '../lib/features.js';

test('counts English frustration and flags it', () => {
  const f = promptFeatures("fix it, it's still not working again");
  assert.ok(f.frustration >= 2, `frustration=${f.frustration}`);
  assert.ok(f.flags.includes('frustrated'));
});

test('counts Russian frustration and profanity', () => {
  const f = promptFeatures('Бля, опять не работает, почини уже');
  assert.ok(f.frustration >= 2, `frustration=${f.frustration}`);
  assert.equal(f.profanity, 1);
  assert.ok(f.flags.includes('frustrated'));
});

test('counts Russian fillers in dictated text and marks it voice-like', () => {
  const f = promptFeatures('э ну короче вот этот компонент он как бы эм не рендерится и типа я не понимаю почему так происходит вообще');
  assert.ok(f.fillers >= 5, `fillers=${f.fillers}`);
  assert.equal(f.voiceLike, true);
});

test('typed code prompt is not voice-like', () => {
  const f = promptFeatures('Rename `getUser` to `fetchUser` in src/api.ts\nand update the tests.');
  assert.equal(f.voiceLike, false);
  assert.equal(f.fillers, 0);
});

test('caps flag needs mostly uppercase letters', () => {
  assert.ok(promptFeatures('WHY IS THIS STILL BROKEN').flags.includes('caps'));
  assert.ok(!promptFeatures('Use the API from AWS SDK').flags.includes('caps'));
});

test('urgent flag on !urgent prefix', () => {
  assert.ok(promptFeatures('!urgent prod is down, roll back').flags.includes('urgent'));
});

test('rejection only at the start of a prompt', () => {
  assert.equal(promptFeatures('No, revert that change').rejection, true);
  assert.equal(promptFeatures('Не то, верни как было').rejection, true);
  assert.equal(promptFeatures('Add a "no results" message').rejection, false);
});

test('counts politeness, exclaim and question runs', () => {
  const f = promptFeatures('Please check this, thanks!! Why?? Спасибо');
  assert.equal(f.polite, 3);
  assert.equal(f.exclaims, 1);
  assert.equal(f.questions, 1);
});

test('counts pasted error and stack trace lines', () => {
  const f = promptFeatures([
    'getting this:',
    'TypeError: Cannot read properties of undefined',
    '    at render (src/App.tsx:12:5)',
    '    at main (src/index.ts:3:1)',
  ].join('\n'));
  assert.equal(f.pastedLines, 3);
});

test('simhash: near-duplicates are close, different prompts are far', () => {
  const a = simhash('the login form still fails after submit, please fix the login form');
  const b = simhash('the login form still fails after submit, fix the login form');
  const c = simhash('add a dark mode toggle to the settings page with persistence');
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(hamming(a, b) <= DUPLICATE_BITS, `near=${hamming(a, b)}`);
  assert.ok(hamming(a, c) > DUPLICATE_BITS, `far=${hamming(a, c)}`);
});

test('simhash: different prompts with the same polite words are not near-duplicates', () => {
  const prompts = [
    'Please add input validation to the signup form and show inline errors, thanks',
    'Could you write tests for the cart reducer covering add, remove and clear? Thanks!',
    'Let us rename getUser to fetchUser across the API client, please',
    'Please add a loading spinner to the orders page while data is fetched',
    'Can you extract the date formatting into a helper and reuse it? Thank you',
  ].map(simhash);
  for (let i = 0; i < prompts.length; i++) {
    for (let j = i + 1; j < prompts.length; j++) assert.ok(hamming(prompts[i], prompts[j]) > DUPLICATE_BITS, `${i}-${j}: ${hamming(prompts[i], prompts[j])}`);
  }
});

test('simhash is only computed for prompts of 20+ chars', () => {
  assert.equal(promptFeatures('fix it').sim, undefined);
  assert.ok(promptFeatures('please fix the failing login test now').sim);
});

test('editLines counts added and removed lines', () => {
  assert.deepEqual(editLines([{ old_string: 'a\nb', new_string: 'a\nb\nc' }, { old_string: '', new_string: 'x' }]), { added: 4, removed: 2 });
  assert.deepEqual(editLines(undefined), { added: 0, removed: 0 });
});

test('shellFailed detects failures and ignores zero counts', () => {
  assert.equal(shellFailed('npm ERR! code ELIFECYCLE'), true);
  assert.equal(shellFailed('Tests: 3 failed, 10 passed'), true);
  assert.equal(shellFailed('Tests: 0 failed, 13 passed'), false);
  assert.equal(shellFailed('done in 1.2s'), false);
});
