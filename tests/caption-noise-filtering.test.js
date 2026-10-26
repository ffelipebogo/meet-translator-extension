/**
 * Caption Noise Filtering - Decision Logic
 *
 * Mirrors CONFIG.CAPTION_NOISE_MARKERS (config.js) and isCaptionNoiseText (content.js) so they
 * can be unit/property tested without a DOM or chrome.* environment. Keep in sync with
 * config.js/content.js if those change.
 *
 * Validates the fix for docs/known-issues.md #2: CAPTION_SELECTORS sometimes matches the Meet
 * participants panel + "Jump to bottom" button instead of the real caption, and that captured
 * text must never become a Fala/Entrada finalizada.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';

const CAPTION_NOISE_MARKERS = ['arrow_downward', 'Jump to bottom'];

function isCaptionNoiseText(text) {
  return CAPTION_NOISE_MARKERS.some(marker => text.includes(marker));
}

// ============================================
// Regression cases from the 2026-08-21 real export
// ============================================

test('rejects the bare "jump to bottom" button capture', () => {
  assert.strictEqual(isCaptionNoiseText('arrow_downward Jump to bottom'), true);
});

test('rejects a participant name list concatenated with the jump-to-bottom button', () => {
  assert.strictEqual(
    isCaptionNoiseText(
      'Thyago Perez Ieva Mišutė Robertas Čekanauskas Ieva Mišutė You      arrow_downward Jump to bottom'
    ),
    true
  );
});

test('accepts real captions that happen to mention people by name', () => {
  assert.strictEqual(isCaptionNoiseText('Brazil office is working from home today.'), false);
  assert.strictEqual(isCaptionNoiseText('Okay, great. Thank you. Roberta\'s chilling also.'), false);
  assert.strictEqual(
    isCaptionNoiseText('Which task? Can you tell me the number?'),
    false
  );
});

test('accepts short real captions', () => {
  assert.strictEqual(isCaptionNoiseText('Good morning.'), false);
  assert.strictEqual(isCaptionNoiseText('Yeah.'), false);
});

// ============================================
// Property-based checks
// ============================================

test('property: any text containing a known noise marker is rejected', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...CAPTION_NOISE_MARKERS),
      fc.string(),
      fc.string(),
      (marker, prefix, suffix) => {
        assert.strictEqual(isCaptionNoiseText(`${prefix}${marker}${suffix}`), true);
      }
    )
  );
});

test('property: text built only from words unrelated to the noise markers is accepted', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('hello', 'world', 'meeting', 'task', 'review', 'sprint', 'thanks'), {
        minLength: 1,
        maxLength: 10
      }),
      words => {
        const text = words.join(' ');
        assert.strictEqual(isCaptionNoiseText(text), false);
      }
    )
  );
});
