// Conditions the analyzer may report and the rest advice it may give (contract/telemetry.ts).
// An LLM may reword `text` but must pick ids from here. Spec: docs/specs/hooks-fatigue-signals.md.

export const CONDITIONS = ['eye-strain', 'decision-fatigue', 'stuck-loop', 'rushing', 'scattered', 'drained', 'late', 'waiting'];

export const CONDITION_INFO = {
  'eye-strain': 'a lot of reading (responses, diffs) without a break',
  'decision-fatigue': 'many prompts and approvals, several chats at once, prompts getting shorter',
  'stuck-loop': 'frustration or rejection words, repeated prompts, pasted errors, aborts and failing runs in a short time',
  rushing: 'interrupting the agent, approving long output within seconds, prompts coming faster',
  scattered: 'frequent switching between conversations',
  drained: 'long time without a break, long session, more fillers and less politeness than usual, or the user said they are fried',
  late: 'working past bedtime',
  waiting: 'the agent has been working for a while; a free moment to rest, not a problem',
};

export const ADVICE = {
  'eyes-20-20-20': { minutes: 1, exercise: 'eyes-20-20-20', text: "Look at something 20 feet away for 20 seconds. I'll blink with you." },
  palming: { minutes: 1, text: 'Rub your palms warm and cover your eyes for a minute. Darkness is a snack for eyes.' },
  'next-steps-on-paper': { minutes: 2, text: 'That was a lot of decisions. Write the next 3 steps on paper, then pick one.' },
  'close-extra-chats': { minutes: 1, text: 'Many agents, one brain. Close the chats you are not watching.' },
  walk: { minutes: 5, exercise: 'walk', text: 'Walk with me for 5 minutes. The agents can wait.' },
  'step-away': { minutes: 2, text: 'Same bug, again. Step away for 2 minutes; fresh eyes find it faster.' },
  'cyclic-sigh': { minutes: 1, exercise: 'cyclic-sigh', text: 'Double inhale through the nose, long exhale through the mouth. Five times with me.' },
  'fresh-chat': { minutes: 1, text: 'This chat is going in circles. Start a fresh one with a 3-line summary.' },
  'rubber-duck': { minutes: 2, text: 'Explain the problem to me in 3 sentences. I am a very good duck.' },
  'breath-before-send': { minutes: 1, exercise: 'cyclic-sigh', text: 'One slow breath before the next send. Fast prompts make slow fixes.' },
  'read-the-diff': { minutes: 2, text: 'That was a lot of code to approve that fast. Read the diff once with me?' },
  stretch: { minutes: 1, exercise: 'stretch', text: 'Stand up and stretch with me. Shoulders down, neck long.' },
  'single-task': { minutes: 25, text: 'You are juggling. Pick one chat for the next 25 minutes; I will hold the others.' },
  'screen-free-break': { minutes: 15, text: 'You have been at it for a long time. 15 minutes away from any screen?' },
  'water-and-food': { minutes: 10, text: "When did you last eat or drink? Let's fix that first." },
  'touch-grass': { minutes: 15, exercise: 'walk', text: "Go outside and touch some grass. I mean it. I'll guard the code." },
  'stop-for-today': { minutes: 0, text: "It's late. Wrap up and call it a day; tomorrow-you will thank you." },
  'note-for-tomorrow': { minutes: 3, text: 'Leave a note for tomorrow-you: where you are and what is next. Then sleep.' },
  'refill-water': { minutes: 2, exercise: 'stretch', text: "The agent is busy. Refill your water and stretch, I'll watch it." },
};

// Rotated in order; the first entry is the default.
export const ADVICE_FOR = {
  'eye-strain': ['eyes-20-20-20', 'palming'],
  'decision-fatigue': ['next-steps-on-paper', 'close-extra-chats', 'walk'],
  'stuck-loop': ['step-away', 'fresh-chat', 'cyclic-sigh', 'rubber-duck'],
  rushing: ['breath-before-send', 'read-the-diff', 'stretch'],
  scattered: ['single-task', 'close-extra-chats'],
  drained: ['touch-grass', 'screen-free-break', 'water-and-food'],
  late: ['stop-for-today', 'note-for-tomorrow'],
  waiting: ['refill-water', 'stretch', 'eyes-20-20-20'],
};

export const MOODS = ['happy', 'focused', 'tired', 'melting', 'sleeping', 'resting'];
export const MIN_CONFIDENCE = 0.5;
export const MAX_ITEMS = 3;
export const MAX_TEXT = 140;

// Foundation §4.5 mood bands.
export function moodFor(load, onBreak) {
  if (onBreak) return 'resting';
  if (load < 30) return 'happy';
  if (load < 60) return 'focused';
  if (load < 85) return 'tired';
  if (load < 95) return 'melting';
  return 'sleeping';
}

export function adviceFor(condition, at) {
  const options = ADVICE_FOR[condition];
  const id = options[Math.floor(at / 600_000) % options.length];
  const { minutes, exercise, text } = ADVICE[id];
  return exercise ? { id, condition, minutes, exercise, text } : { id, condition, minutes, text };
}
