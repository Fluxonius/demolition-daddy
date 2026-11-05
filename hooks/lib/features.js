'use strict';
// In-memory feature extraction. Callers pass text in and get numbers and flags out;
// nothing here keeps or returns any part of the text (AGENTS.md hard rule).
// Lexicons are EN + RU (foundation Q6). Their counts are compared with the user's own baseline,
// so a little noise is fine. Spec: docs/specs/hooks-fatigue-signals.md.

const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])';
const lexicon = (parts) => new RegExp(`${NOT_WORD_BEFORE}(?:${parts.join('|')})${NOT_WORD_AFTER}`, 'giu');

const FILLERS = lexicon([
  'u+m+', 'u+h+', 'e+r+m+', 'h+m+', 'you know', 'i mean', 'basically', 'kinda', 'sort of',
  'э+м*', 'м+', 'ну', 'типа', 'короче', 'как бы', 'вот', 'значит', 'это самое',
]);
const FRUSTRATION = lexicon([
  'fix it', 'still (?:not|broken|failing|fails|doesn\'?t|does not|wrong)', 'again', 'doesn\'?t work', 'does not work',
  'not working', 'broken', 'same error', 'come on',
  'не работае\\p{L}*', 'опять', 'снова', 'всё ещё', 'все еще', 'до сих пор', 'почини\\p{L}*', 'исправь',
  'сломал\\p{L}*', 'та же ошибка', 'сколько можно',
]);
const PROFANITY = lexicon([
  'fuck\\p{L}*', 'shit\\p{L}*', 'wtf', 'damn', 'crap',
  'бля\\p{L}*', 'хуй\\p{L}*', 'хуе\\p{L}*', 'пизд\\p{L}*', 'еба\\p{L}*', 'ёба\\p{L}*', 'нахуй', 'сука', 'блин', 'черт', 'чёрт',
]);
const POLITE = lexicon(['please', 'pls', 'thanks', 'thank you', 'thx', 'пожалуйста', 'спасибо', 'спс', 'будь добр\\p{L}*']);
const REJECTION = /^\s*(?:no|nope|nah|wrong|revert|undo|stop|нет|не то|не так|откати\p{L}*|верни|отмени|стоп)(?![\p{L}\p{N}])/iu;
const URGENT = /^\s*!urgent(?![\p{L}\p{N}])/iu;
const PASTED_LINE = /(?:error|exception)\b|\b(?:traceback|fatal|panic)\b|^\s+at\s+\S.*:\d+(?::\d+)?\)?\s*$|^\s*File ".*", line \d+/i;
const SHELL_FAILURE = /\b(?:error|errors|failed|failure|failures|exception|traceback|fatal|panic)\b|npm ERR!|exit code [1-9]/i;
const SHELL_ZERO_COUNT = /\b0 (?:failed|failures|errors?)\b/gi;
const WORD = /[\p{L}\p{N}]+/gu;

const count = (re, text) => (text.match(re) || []).length;

function promptFeatures(text) {
  const t = typeof text === 'string' ? text : '';
  const words = t.match(WORD) || [];
  const letters = t.match(/\p{L}/gu) || [];
  const upper = t.match(/\p{Lu}/gu) || [];
  const fillers = count(FILLERS, t);
  const frustration = count(FRUSTRATION, t);
  const profanity = count(PROFANITY, t);
  const typed = /\n|`/.test(t);
  const sentenceMarks = count(/[.!?;]/g, t);
  const voiceLike = !typed && words.length >= 12 &&
    (fillers / words.length >= 0.04 || (words.length >= 25 && sentenceMarks / words.length < 0.04));

  const flags = [];
  if (frustration + profanity > 0) flags.push('frustrated');
  if (letters.length >= 12 && upper.length / letters.length >= 0.7) flags.push('caps');
  if (URGENT.test(t)) flags.push('urgent');

  const out = {
    chars: t.length,
    words: words.length,
    fillers,
    frustration,
    profanity,
    rejection: REJECTION.test(t),
    polite: count(POLITE, t),
    exclaims: count(/!{2,}/g, t),
    questions: count(/\?{2,}/g, t),
    pastedLines: t.split('\n').filter((line) => PASTED_LINE.test(line)).length,
    voiceLike,
    flags,
  };
  if (t.length >= 20) out.sim = simhash(t);
  return out;
}

function editLines(edits) {
  let added = 0;
  let removed = 0;
  for (const e of Array.isArray(edits) ? edits : []) {
    if (e && typeof e.new_string === 'string' && e.new_string) added += e.new_string.split('\n').length;
    if (e && typeof e.old_string === 'string' && e.old_string) removed += e.old_string.split('\n').length;
  }
  return { added, removed };
}

function shellFailed(output) {
  return typeof output === 'string' && SHELL_FAILURE.test(output.replace(SHELL_ZERO_COUNT, ''));
}

const MASK64 = (1n << 64n) - 1n;
// Prompts within this many differing bits are near-duplicates. Measured: one word dropped from a
// 12-word prompt ≈ 15 bits; unrelated prompts ≥ 23 bits (random text averages 32).
const DUPLICATE_BITS = 18;

// FNV-1a mixes low bits poorly on short strings, so the result goes through MurmurHash3's fmix64.
function hash64(s) {
  let h = 0xcbf29ce484222325n;
  for (const byte of Buffer.from(s, 'utf8')) {
    h ^= BigInt(byte);
    h = (h * 0x100000001b3n) & MASK64;
  }
  h ^= h >> 33n;
  h = (h * 0xff51afd7ed558ccdn) & MASK64;
  h ^= h >> 33n;
  h = (h * 0xc4ceb53fe1a85ec3n) & MASK64;
  h ^= h >> 33n;
  return h;
}

// 64-bit SimHash over word bigrams, hex encoded. Close hashes mean near-duplicate prompts.
function simhash(text) {
  const words = (String(text).toLowerCase().match(WORD) || []);
  const shingles = words.length < 2 ? words : words.slice(1).map((w, i) => `${words[i]} ${w}`);
  const votes = new Array(64).fill(0);
  for (const s of shingles) {
    const h = hash64(s);
    for (let bit = 0; bit < 64; bit++) votes[bit] += (h >> BigInt(bit)) & 1n ? 1 : -1;
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit++) if (votes[bit] > 0) out |= 1n << BigInt(bit);
  return out.toString(16).padStart(16, '0');
}

function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

module.exports = { promptFeatures, editLines, shellFailed, simhash, hamming, DUPLICATE_BITS };
