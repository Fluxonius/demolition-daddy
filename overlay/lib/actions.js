'use strict';
const fs = require('node:fs');
const { petDir, eventsPath } = require('./pet-dir');

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

/** Appends the event for msg to events.jsonl. Never throws. */
function recordAction(msg) {
  const event = toEvent(msg);
  if (!event) return null;
  try {
    fs.mkdirSync(petDir(), { recursive: true });
    fs.appendFileSync(eventsPath(), JSON.stringify(event) + '\n');
  } catch {
    return null;
  }
  return event;
}

module.exports = { toEvent, recordAction };
