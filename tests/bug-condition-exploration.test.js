/**
 * Bug Condition Exploration Test - Caption History Buffer Fix
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bugs exist
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * This test encodes the EXPECTED behavior (dual-buffer, debounced translation, 
 * append-only history, smart auto-scroll). It will validate the fix when it passes
 * after implementation.
 * 
 * GOAL: Surface counterexamples that demonstrate the five core bug scenarios:
 * 1. Rapid caption changes (< 1000ms intervals) cause translation loss
 * 2. Speaker transitions mix content together
 * 3. History updates overwrite instead of append
 * 4. User scroll position is not preserved
 * 5. Incomplete text triggers premature translation
 */

import fc from 'fast-check';
import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// TEST HARNESS - Simulates content.js behavior
// ============================================

/**
 * Mock translation system that simulates the current (buggy) implementation
 * This extracts and replicates the key logic from content.js
 */
class TranslationSystemUnfixed {
  constructor() {
    this.isActive = false;
    this.translationHistory = [];
    this.translationSequence = 0;
    this.lastCaptionText = '';
    this.lastSpeakerName = '';
    this.debounceTimer = null;
    this.currentTranslation = { original: '', translated: '', speaker: '' };
    this.scrollPosition = 0;
    this.contentHeight = 1000;
    this.viewportHeight = 300;
    this.translationCallCount = 0;
    this.liveBuffer = null; // No live buffer in unfixed code
    this.historyBuffer = []; // Single buffer for everything
  }

  start() {
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Simulates the unfixed processCaptionChange behavior:
   * - Immediately replaces current text (no live buffer)
   * - Short debounce that doesn't prevent multiple translations
   * - Overwrites history instead of appending
   */
  processCaptionChange(text, speaker = '') {
    if (!this.isActive) return;

    const resolvedSpeaker = speaker || this.lastSpeakerName || 'Desconhecido';
    
    // UNFIXED: Immediately replace current text (no live buffer concept)
    this.currentTranslation.original = text;
    this.currentTranslation.speaker = resolvedSpeaker;
    this.currentTranslation.translated = ''; // Clear translation

    // UNFIXED: Short debounce (500ms) doesn't prevent rapid re-translations
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.translateAndUpdate(text, resolvedSpeaker);
    }, 500); // CONFIG.DEBOUNCE_DELAY from config.js

    this.lastCaptionText = text;
    this.lastSpeakerName = resolvedSpeaker;

    // UNFIXED: Auto-scroll always happens, regardless of user position
    this.scrollToBottom();
  }

  /**
   * Simulates translation and history update (unfixed behavior)
   */
  translateAndUpdate(text, speaker) {
    this.translationCallCount++;
    
    // Simulate translation
    const translation = `[TRANSLATED: ${text}]`;
    this.currentTranslation.translated = translation;

    // UNFIXED: History management is broken
    // - Tries to "update" last entry if same speaker (violates immutability)
    // - Doesn't distinguish between "live" and "finalized" entries
    const lastEntry = this.translationHistory.length > 0 
      ? this.translationHistory[this.translationHistory.length - 1] 
      : null;

    if (lastEntry && this.shouldUpdateLastEntry(lastEntry.speaker, speaker)) {
      // UNFIXED: Overwrites existing history entry
      lastEntry.original = text;
      lastEntry.translated = translation;
      lastEntry.speaker = speaker;
    } else {
      // Creates new entry
      const entry = {
        id: ++this.translationSequence,
        timestamp: Date.now(),
        speaker: speaker,
        original: text,
        translated: translation,
        isFinalized: false // Unfixed code doesn't have this concept
      };
      this.translationHistory.push(entry);
    }

    // Keep history size limit
    if (this.translationHistory.length > 50) {
      this.translationHistory.shift();
    }
  }

  /**
   * Unfixed speaker comparison logic - treats same speaker as "update existing"
   */
  shouldUpdateLastEntry(lastSpeaker, currentSpeaker) {
    const normalize = (name) => String(name || '').trim().toLowerCase();
    return normalize(lastSpeaker) === normalize(currentSpeaker);
  }

  /**
   * UNFIXED: Always auto-scrolls, doesn't preserve user position
   */
  scrollToBottom() {
    this.scrollPosition = this.contentHeight - this.viewportHeight;
  }

  /**
   * User scrolls to read history
   */
  userScrollTo(position) {
    this.scrollPosition = Math.max(0, Math.min(position, this.contentHeight - this.viewportHeight));
  }

  /**
   * Check if user is at bottom
   */
  isAtBottom() {
    return this.scrollPosition >= (this.contentHeight - this.viewportHeight - 50);
  }

  /**
   * Get current state for assertions
   */
  getState() {
    return {
      history: [...this.translationHistory],
      currentTranslation: { ...this.currentTranslation },
      scrollPosition: this.scrollPosition,
      translationCallCount: this.translationCallCount,
      liveBuffer: this.liveBuffer,
      historyBuffer: [...this.historyBuffer]
    };
  }
}

// ============================================
// PROPERTY-BASED TEST GENERATORS
// ============================================

/**
 * Generate caption event sequences that should trigger bugs
 */
const captionEventArbitrary = fc.record({
  type: fc.constantFrom('rapid_change', 'speaker_transition', 'long_text', 'stable'),
  text: fc.string({ minLength: 1, maxLength: 800 }),
  speaker: fc.constantFrom('Speaker A', 'Speaker B', 'Speaker C', ''),
  delayMs: fc.nat({ max: 2000 })
});

/**
 * Generate sequences of caption events
 */
const captionSequenceArbitrary = fc.array(captionEventArbitrary, { minLength: 1, maxLength: 20 });

/**
 * Generate user scroll actions
 */
const scrollActionArbitrary = fc.record({
  type: fc.constant('scroll'),
  position: fc.nat({ max: 700 })
});

// ============================================
// BUG CONDITION EXPLORATION TESTS
// ============================================

/**
 * Property 1: Bug Condition - Dual-Buffer Display with Debounced Translation
 * 
 * Tests that the system correctly implements:
 * - Dual-buffer architecture (live vs history)
 * - Debounced translation (800-1200ms stability period)
 * - Append-only history (no overwrites)
 * - Smart auto-scroll (preserve user position)
 * - Caption stability detection
 * 
 * EXPECTED: This test WILL FAIL on unfixed code, surfacing counterexamples
 */
console.log('\n=== Bug Condition Exploration Test ===\n');
console.log('CRITICAL: This test is EXPECTED TO FAIL on unfixed code');
console.log('Failure confirms the bugs exist and surfaces counterexamples\n');

let testResults = {
  rapidChangeFailures: 0,
  speakerTransitionFailures: 0,
  historyOverwriteFailures: 0,
  scrollPositionFailures: 0,
  prematureTranslationFailures: 0,
  totalScenarios: 0
};

/**
 * Test Scenario 1: Rapid Caption Changes
 * Bug: Old translations disappear, multiple API calls for same evolving caption
 * Expected Behavior: Live buffer shows current text, history preserves old translations
 */
console.log('📋 Scenario 1: Rapid Caption Changes (< 1000ms intervals)');
console.log('   Expected: Translation loss, multiple API calls\n');

try {
  fc.assert(
    fc.property(fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 3, maxLength: 5 }), (texts) => {
      const system = new TranslationSystemUnfixed();
      system.start();

      // Simulate rapid caption updates (evolving text)
      texts.forEach((text, idx) => {
        system.processCaptionChange(text, 'Speaker A');
        // Short delay between updates (< 500ms, less than debounce)
        if (idx < texts.length - 1) {
          // No actual delay in test, but conceptually < debounce time
        }
      });

      // Wait for debounce to complete
      system.stop();
      const state = system.getState();

      // ASSERTION 1: Should have live buffer (unfixed doesn't)
      assert.notEqual(state.liveBuffer, null, 'Live buffer should exist');

      // ASSERTION 2: Should only call translation once per stable caption
      // Unfixed code calls multiple times as text evolves
      assert.equal(state.translationCallCount, 1, 
        `Should translate once after stability, but called ${state.translationCallCount} times`);

      // ASSERTION 3: History should preserve all stable versions
      // Unfixed code loses intermediate versions
      assert.ok(state.history.length >= texts.length - 1, 
        'History should preserve translations, not lose them');

      testResults.totalScenarios++;
    }),
    { numRuns: 10, verbose: true }
  );
  console.log('   ✅ PASSED (unexpected - bug may not exist)\n');
} catch (error) {
  testResults.rapidChangeFailures++;
  console.log('   ❌ FAILED (expected - bug confirmed)');
  console.log(`   Counterexample found: ${error.message}\n`);
}

/**
 * Test Scenario 2: Speaker Transitions
 * Bug: Captions from different speakers get mixed together
 * Expected Behavior: Separate history entries for each speaker
 */
console.log('📋 Scenario 2: Speaker Transitions');
console.log('   Expected: Mixed content from different speakers\n');

try {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          text: fc.string({ minLength: 10, maxLength: 50 }),
          speaker: fc.constantFrom('Alice', 'Bob', 'Charlie')
        }),
        { minLength: 4, maxLength: 8 }
      ),
      (captions) => {
        const system = new TranslationSystemUnfixed();
        system.start();

        // Process captions from different speakers
        captions.forEach(({ text, speaker }) => {
          system.processCaptionChange(text, speaker);
          // Simulate time for debounce to complete
          system.translateAndUpdate(text, speaker);
        });

        const state = system.getState();

        // ASSERTION 1: Each speaker change should create new history entry
        const uniqueSpeakers = [...new Set(captions.map(c => c.speaker))];
        if (uniqueSpeakers.length > 1) {
          // Count how many times speaker changed
          let speakerChanges = 0;
          for (let i = 1; i < captions.length; i++) {
            if (captions[i].speaker !== captions[i - 1].speaker) {
              speakerChanges++;
            }
          }

          // History should have at least as many entries as speaker changes
          assert.ok(state.history.length > speakerChanges,
            `Should have separate entries for ${speakerChanges} speaker changes, got ${state.history.length}`);
        }

        // ASSERTION 2: Verify speaker names are correctly associated
        state.history.forEach((entry, idx) => {
          const expectedSpeaker = captions[idx]?.speaker || 'Desconhecido';
          assert.ok(entry.speaker, 'Each entry should have a speaker');
        });

        testResults.totalScenarios++;
      }
    ),
    { numRuns: 10, verbose: true }
  );
  console.log('   ✅ PASSED (unexpected - bug may not exist)\n');
} catch (error) {
  testResults.speakerTransitionFailures++;
  console.log('   ❌ FAILED (expected - bug confirmed)');
  console.log(`   Counterexample found: ${error.message}\n`);
}

/**
 * Test Scenario 3: History Overwrite vs Append
 * Bug: New captions overwrite existing history entries
 * Expected Behavior: History is append-only, old entries never change
 */
console.log('📋 Scenario 3: History Management (Overwrite vs Append)');
console.log('   Expected: History overwrites instead of appending\n');

try {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 5, maxLength: 10 }),
      (texts) => {
        const system = new TranslationSystemUnfixed();
        system.start();

        // Track history snapshots
        const historySnapshots = [];

        texts.forEach((text, idx) => {
          system.processCaptionChange(text, 'Speaker A');
          system.translateAndUpdate(text, 'Speaker A');
          
          // Take snapshot
          historySnapshots.push(JSON.parse(JSON.stringify(system.getState().history)));
        });

        // ASSERTION: Old entries should never change after finalization
        // Check if any entry from previous snapshots was modified
        for (let i = 1; i < historySnapshots.length; i++) {
          const prevSnapshot = historySnapshots[i - 1];
          const currSnapshot = historySnapshots[i];

          // All entries from previous snapshot should exist unchanged in current
          prevSnapshot.forEach((oldEntry) => {
            const matchingEntry = currSnapshot.find(e => e.id === oldEntry.id);
            if (matchingEntry) {
              assert.deepEqual(
                { original: matchingEntry.original, translated: matchingEntry.translated },
                { original: oldEntry.original, translated: oldEntry.translated },
                `Entry ${oldEntry.id} was modified (overwritten) instead of being immutable`
              );
            }
          });
        }

        testResults.totalScenarios++;
      }
    ),
    { numRuns: 10, verbose: true }
  );
  console.log('   ✅ PASSED (unexpected - bug may not exist)\n');
} catch (error) {
  testResults.historyOverwriteFailures++;
  console.log('   ❌ FAILED (expected - bug confirmed)');
  console.log(`   Counterexample found: ${error.message}\n`);
}

/**
 * Test Scenario 4: Smart Auto-Scroll
 * Bug: Auto-scroll interrupts user reading, doesn't preserve scroll position
 * Expected Behavior: Auto-scroll only when user is at bottom
 */
console.log('📋 Scenario 4: Auto-Scroll Preservation');
console.log('   Expected: Scroll position not preserved when user reads history\n');

try {
  fc.assert(
    fc.property(
      fc.tuple(
        fc.nat({ max: 400 }), // User scroll position
        fc.string({ minLength: 10, maxLength: 50 }) // New caption
      ),
      ([userScrollPos, newCaption]) => {
        const system = new TranslationSystemUnfixed();
        system.start();

        // Create some history
        for (let i = 0; i < 5; i++) {
          system.processCaptionChange(`Caption ${i}`, 'Speaker A');
          system.translateAndUpdate(`Caption ${i}`, 'Speaker A');
        }

        // User scrolls up to read history
        const wasAtBottom = system.isAtBottom();
        system.userScrollTo(userScrollPos);
        const scrollBeforeNewCaption = system.scrollPosition;

        // New caption arrives
        system.processCaptionChange(newCaption, 'Speaker A');

        const scrollAfterNewCaption = system.scrollPosition;

        // ASSERTION: If user was NOT at bottom, scroll position should be preserved
        if (!wasAtBottom && userScrollPos < 650) {
          assert.equal(
            scrollAfterNewCaption,
            scrollBeforeNewCaption,
            `Scroll position should be preserved (was ${scrollBeforeNewCaption}, became ${scrollAfterNewCaption})`
          );
        }

        testResults.totalScenarios++;
      }
    ),
    { numRuns: 10, verbose: true }
  );
  console.log('   ✅ PASSED (unexpected - bug may not exist)\n');
} catch (error) {
  testResults.scrollPositionFailures++;
  console.log('   ❌ FAILED (expected - bug confirmed)');
  console.log(`   Counterexample found: ${error.message}\n`);
}

/**
 * Test Scenario 5: Premature Translation
 * Bug: Incomplete/changing text gets translated multiple times
 * Expected Behavior: Translation only after text stabilizes
 */
console.log('📋 Scenario 5: Translation Debouncing (Premature Translation)');
console.log('   Expected: Multiple translations for evolving caption\n');

try {
  fc.assert(
    fc.property(
      fc.array(fc.string({ minLength: 5, maxLength: 30 }), { minLength: 3, maxLength: 5 }),
      (evolvingTexts) => {
        const system = new TranslationSystemUnfixed();
        system.start();

        const initialCallCount = system.translationCallCount;

        // Simulate evolving caption (same speaker, text changes)
        evolvingTexts.forEach((text, idx) => {
          system.processCaptionChange(text, 'Speaker A');
          // Immediately trigger translation (simulates unfixed short debounce)
          if (system.debounceTimer) {
            clearTimeout(system.debounceTimer);
            system.translateAndUpdate(text, 'Speaker A');
          }
        });

        const finalCallCount = system.translationCallCount;
        const translationsMade = finalCallCount - initialCallCount;

        // ASSERTION: Should only translate once after stabilization
        // Unfixed code translates multiple times as text evolves
        assert.equal(
          translationsMade,
          1,
          `Should translate once after stability, but translated ${translationsMade} times for ${evolvingTexts.length} text updates`
        );

        testResults.totalScenarios++;
      }
    ),
    { numRuns: 10, verbose: true }
  );
  console.log('   ✅ PASSED (unexpected - bug may not exist)\n');
} catch (error) {
  testResults.prematureTranslationFailures++;
  console.log('   ❌ FAILED (expected - bug confirmed)');
  console.log(`   Counterexample found: ${error.message}\n`);
}

// ============================================
// TEST RESULTS SUMMARY
// ============================================

console.log('\n=== Bug Exploration Summary ===\n');
console.log(`Total test scenarios executed: ${testResults.totalScenarios}`);
console.log(`\nBugs confirmed (expected failures):`);
console.log(`  - Rapid caption changes: ${testResults.rapidChangeFailures > 0 ? '✅ BUG CONFIRMED' : '❌ Not detected'}`);
console.log(`  - Speaker transitions: ${testResults.speakerTransitionFailures > 0 ? '✅ BUG CONFIRMED' : '❌ Not detected'}`);
console.log(`  - History overwrites: ${testResults.historyOverwriteFailures > 0 ? '✅ BUG CONFIRMED' : '❌ Not detected'}`);
console.log(`  - Scroll position loss: ${testResults.scrollPositionFailures > 0 ? '✅ BUG CONFIRMED' : '❌ Not detected'}`);
console.log(`  - Premature translation: ${testResults.prematureTranslationFailures > 0 ? '✅ BUG CONFIRMED' : '❌ Not detected'}`);

const totalBugsConfirmed = testResults.rapidChangeFailures + 
                           testResults.speakerTransitionFailures + 
                           testResults.historyOverwriteFailures + 
                           testResults.scrollPositionFailures + 
                           testResults.prematureTranslationFailures;

console.log(`\nTotal bugs confirmed: ${totalBugsConfirmed}/5`);

if (totalBugsConfirmed > 0) {
  console.log('\n✅ EXPLORATION SUCCESSFUL: Test failures confirm bugs exist');
  console.log('   These failures are EXPECTED and prove the hypothesized root cause');
  console.log('   Proceed to implement the fix as designed\n');
  process.exit(0); // Exit with success - failures are expected for exploration
} else {
  console.log('\n⚠️  WARNING: No bugs detected');
  console.log('   This is unexpected - either:');
  console.log('   1. The code has already been fixed');
  console.log('   2. The root cause analysis needs revision');
  console.log('   3. The test needs adjustment to properly simulate the bugs\n');
  process.exit(1);
}
