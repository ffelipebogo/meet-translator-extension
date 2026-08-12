/**
 * Live Utterance Continuation - Decision Logic
 *
 * Mirrors the pure functions in content.js (isContinuationOfLiveUtterance,
 * isScrolledToBottom, normalizeSpeakerName, isUnknownSpeakerLabel,
 * isSameCaptionTextExtension) so they can be unit/property tested without a
 * DOM or chrome.* environment. Keep in sync with content.js if those change.
 *
 * Validates the dual-buffer design agreed in ADR 0001: a live utterance only
 * continues (instead of being finalized and replaced by a new one) when we
 * have strong evidence it's still the same speaker talking.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';

function normalizeSpeakerName(name) {
  return String(name || '').trim().toLowerCase();
}

function isUnknownSpeakerLabel(name) {
  const n = normalizeSpeakerName(name);
  return !n || n === 'desconhecido';
}

function isSameCaptionTextExtension(lastEntry, newText) {
  if (!lastEntry || !newText) return false;
  const prev = String(lastEntry.original || '').trim();
  const next = String(newText).trim();
  if (!prev || !next) return false;
  if (prev === next) return true;
  return next.startsWith(prev) || prev.startsWith(next);
}

function isContinuationOfLiveUtterance(live, incomingText, incomingSpeaker) {
  if (!live) return false;

  const liveUnknown = isUnknownSpeakerLabel(live.speaker);
  const incomingUnknown = isUnknownSpeakerLabel(incomingSpeaker);

  if (!liveUnknown && !incomingUnknown) {
    return normalizeSpeakerName(live.speaker) === normalizeSpeakerName(incomingSpeaker);
  }
  return isSameCaptionTextExtension(live, incomingText);
}

function isScrolledToBottom(scrollTop, scrollHeight, clientHeight, threshold = 50) {
  if (scrollHeight <= clientHeight) return true;
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

// ============================================
// isContinuationOfLiveUtterance
// ============================================

test('no live utterance yet is never a continuation', () => {
  assert.strictEqual(isContinuationOfLiveUtterance(null, 'Olá', 'Alice'), false);
});

test('same named speaker continues the live utterance', () => {
  const live = { speaker: 'Alice', original: 'Hello' };
  assert.strictEqual(isContinuationOfLiveUtterance(live, 'Hello there', 'Alice'), true);
});

test('a different named speaker ends the live utterance', () => {
  const live = { speaker: 'Alice', original: 'Hello' };
  assert.strictEqual(isContinuationOfLiveUtterance(live, 'Sounds good', 'Bob'), false);
});

test('speaker name resolving mid-utterance (unknown -> known) continues it when the text is still the same evolving caption', () => {
  const live = { speaker: 'Desconhecido', original: 'Hello' };
  assert.strictEqual(isContinuationOfLiveUtterance(live, 'Hello there, everyone', 'Alice'), true);
});

test('unknown speaker followed by a named speaker with unrelated text ends the utterance', () => {
  // Found in review: an unresolved speaker's live utterance must not be silently overwritten by
  // a genuinely different, newly-identified speaker just because the previous speaker was unknown.
  const live = { speaker: 'Desconhecido', original: 'Bom dia a todos' };
  assert.strictEqual(
    isContinuationOfLiveUtterance(live, 'Vamos começar a reunião', 'Alice'),
    false
  );
});

test('known speaker followed by unresolved name continues only if text is a growing extension', () => {
  const live = { speaker: 'Alice', original: 'I think we should' };
  assert.strictEqual(
    isContinuationOfLiveUtterance(live, 'I think we should consider the budget', ''),
    true
  );
});

test('known speaker followed by unresolved name and unrelated text ends the utterance', () => {
  const live = { speaker: 'Alice', original: 'I think we should consider the budget' };
  assert.strictEqual(
    isContinuationOfLiveUtterance(live, 'Sounds good to me', ''),
    false
  );
});

test('two unresolved speakers continue only if text is a growing extension', () => {
  const live = { speaker: '', original: 'Bom dia' };
  assert.strictEqual(isContinuationOfLiveUtterance(live, 'Bom dia pessoal', ''), true);
  assert.strictEqual(isContinuationOfLiveUtterance(live, 'Outra coisa completamente diferente', ''), false);
});

test('property: identical known speaker names always continue, regardless of text', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 30 }).filter(s => !isUnknownSpeakerLabel(s)),
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.string({ minLength: 1, maxLength: 200 }),
      (speaker, liveText, incomingText) => {
        const live = { speaker, original: liveText };
        return isContinuationOfLiveUtterance(live, incomingText, speaker) === true;
      }
    ),
    { numRuns: 50 }
  );
});

test('property: two different, non-empty, non-"desconhecido" speaker names never continue', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 30 }).filter(s => !isUnknownSpeakerLabel(s)),
      fc.string({ minLength: 1, maxLength: 30 }).filter(s => !isUnknownSpeakerLabel(s)),
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.string({ minLength: 1, maxLength: 200 }),
      (speakerA, speakerB, liveText, incomingText) => {
        fc.pre(normalizeSpeakerName(speakerA) !== normalizeSpeakerName(speakerB));
        const live = { speaker: speakerA, original: liveText };
        return isContinuationOfLiveUtterance(live, incomingText, speakerB) === false;
      }
    ),
    { numRuns: 50 }
  );
});

// ============================================
// isScrolledToBottom
// ============================================

test('exactly at the bottom counts as at bottom', () => {
  assert.strictEqual(isScrolledToBottom(700, 1000, 300), true);
});

test('within the threshold counts as at bottom', () => {
  assert.strictEqual(isScrolledToBottom(660, 1000, 300, 50), true);
});

test('beyond the threshold does not count as at bottom', () => {
  assert.strictEqual(isScrolledToBottom(500, 1000, 300, 50), false);
});

test('content shorter than the viewport is always at bottom', () => {
  assert.strictEqual(isScrolledToBottom(0, 200, 300), true);
});
