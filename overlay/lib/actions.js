'use strict';
const fs = require('node:fs');
const { petDir, eventsPath, actionsPath } = require('./pet-dir');

// FromWebview messages (foundation spec §4.4) mapped to PetEvent ext.* lines (§4.3).
// With no extension host, the overlay appends them to events.jsonl itself so the engine sees them.
const ACTION_EVENTS = {
  startBreak: { type: 'ext.breakStart', data: { minutes: 1 } },
  snooze: { type: 'ext.snooze', data: {} },
  urgent: { type: 'ext.urgentStart', data: { minutes: 30 } },
  pet: { type: 'ext.petInteraction', data: { action: 'pet' } },
  feed: { type: 'ext.petInteraction', data: { action: 'feed' } },
  calibrateFine: { type: 'ext.calibrate', data: { feeling: 'fine' } },
  calibrateDrained: { type: 'ext.calibrate', data: { feeling: 'drained' } },
};

/** Converts a FromWebview message into a PetEvent, or null if it carries no event. */
function toEvent(msg, now = Date.now()) {
  if (!msg || typeof msg !== 'object') return null;
  let spec;
  if (msg.type === 'action') spec = ACTION_EVENTS[msg.action];
  else if (msg.type === 'nudgeAccepted') spec = ACTION_EVENTS.startBreak;
  else if (msg.type === 'nudgeDismissed') spec = ACTION_EVENTS.snooze;
  if (!spec) return null;
  return { v: 1, ts: now, src: 'ext', type: spec.type, data: { ...spec.data, window: 'overlay' } };
}

// Replies to messages.json (proposed contract, see overlay/README.md "Messages") go to actions.jsonl:
// { v: 1, ts, src: 'overlay', messageId, action } where action is a button's action id,
// or 'dismiss' (bubble clicked) / 'expire' (ttl ran out).
const SAFE_ID = /^[\w.:@/-]{1,200}$/;

/** Converts a messageAction from the page into an actions.jsonl line, or null if invalid. */
function toMessageAction(msg, now = Date.now()) {
  if (!msg || msg.type !== 'messageAction') return null;
  if (typeof msg.id !== 'string' || !SAFE_ID.test(msg.id)) return null;
  if (typeof msg.action !== 'string' || !SAFE_ID.test(msg.action)) return null;
  return { v: 1, ts: now, src: 'overlay', messageId: msg.id, action: msg.action };
}

function append(file, obj) {
  try {
    fs.mkdirSync(petDir(), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
    return obj;
  } catch {
    return null;
  }
}

/** Appends msg to events.jsonl (ext.* events) or actions.jsonl (message replies). Never throws. */
function recordAction(msg) {
  const reply = toMessageAction(msg);
  if (reply) return append(actionsPath(), reply);
  const event = toEvent(msg);
  return event ? append(eventsPath(), event) : null;
}

module.exports = { toEvent, toMessageAction, recordAction };
