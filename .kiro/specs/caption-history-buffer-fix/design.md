# Caption History Buffer Fix - Bugfix Design

## Overview

This design addresses critical UX issues in the Google Meet translation extension's caption management system. The current implementation causes information loss when captions change rapidly, breaks history functionality, mixes speakers together, and creates a jarring user experience with flickering translations. The fix implements a **dual-buffer system** with separate "live text" (current, changing captions) and "history text" (finalized, immutable captions) buffers, combined with **debounced translation** to ensure stable text is translated only once. This ensures users never lose information and can always read past and present captions clearly.

The dual-buffer approach separates concerns: the live buffer handles rapidly changing Google Meet captions, while the history buffer preserves finalized translations in an append-only, immutable structure. Debounced translation (800-1200ms delay) prevents wasted API calls and flickering by waiting for text to stabilize before translating.

## Glossary

- **Bug_Condition (C)**: The conditions that trigger UX issues - rapid caption changes, speaker transitions, long text, or user scrolling while auto-scroll is active
- **Property (P)**: The desired behavior - stable dual-buffer display with debounced translation, append-only history, and smart auto-scroll
- **Preservation**: Existing functionality that must remain unchanged - API selection, language configuration, export, drag/resize, speaker display
- **Dual-Buffer System**: Architecture with two separate display areas: "live text" buffer (current caption, changes frequently) and "history text" buffer (finalized captions, append-only, never changes)
- **Debounced Translation**: Technique that delays translation until text has been stable for a configurable period (800-1200ms), preventing translation of incomplete or changing text
- **Live Text Buffer**: The top section of the translation box showing the current caption that is still being modified by Google Meet
- **History Text Buffer**: The scrollable section showing finalized, immutable translation entries in chronological order
- **Caption Stability**: Text that has not changed for the debounce period, indicating Google Meet has finished modifying the caption
- **Append-Only History**: History entries are never modified or deleted after being added; new entries are always appended to the end
- **Smart Auto-Scroll**: Auto-scroll behavior that only activates when user is at the bottom of history; preserves reading position when user scrolls up
- **Speaker Transition**: When the speaker name changes between consecutive captions, requiring a new history entry
- **Translation Session Token**: An incrementing counter that invalidates pending translations and callbacks when translation stops
- **Entry Sequence**: Per-history-entry counter that invalidates old translation responses if the same entry is updated multiple times

## Bug Details

### Bug Condition

The bug manifests when captions change rapidly, speakers transition, long text appears, or users attempt to read history. The current implementation immediately replaces text, mixes speaker content, breaks history by overwriting entries, and auto-scrolls even when users are reading past translations.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type CaptionEvent OR UserInteraction
  OUTPUT: boolean
  
  RETURN (input.type == "caption_change" AND timeSinceLastChange(input) < 1000ms)
         OR (input.type == "speaker_change" AND previousSpeaker != currentSpeaker)
         OR (input.type == "long_text" AND input.text.length > 500)
         OR (input.type == "translation_request" AND input.text.isStillChanging)
         OR (input.type == "history_update" AND historyArray.length > 0)
         OR (input.type == "user_scroll" AND autoScrollEnabled)
END FUNCTION
```

### Examples

**Example 1: Rapid Caption Changes (Context Loss)**
- **Current behavior**: User sees "Hello everyone" with translation "Olá a todos", then Google Meet updates to "Hello everyone, welcome to the meeting" but the old translation disappears before user can read it
- **Expected behavior**: "Hello everyone" should be moved to history with its translation intact, while "Hello everyone, welcome to the meeting" appears in the live text buffer and gets translated after stabilizing

**Example 2: Speaker Transition (Mixed Content)**
- **Current behavior**: Speaker A says "Let's begin", then Speaker B says "Sounds good" - both get mixed together in one entry showing "Let's begin Sounds good" from "Speaker A"
- **Expected behavior**: Two separate history entries: "Speaker A: Let's begin → Vamos começar" and "Speaker B: Sounds good → Parece bom"

**Example 3: History Breakage (Overwriting)**
- **Current behavior**: User has 3 translated entries in history, new caption arrives and overwrites the most recent entry instead of appending, causing loss of previous translation
- **Expected behavior**: New caption creates a new history entry appended to the list; old entries remain unchanged and visible

**Example 4: Auto-Scroll Interruption (Reading Experience)**
- **Current behavior**: User scrolls up to re-read a translation from 30 seconds ago, new caption arrives and auto-scrolls to bottom, interrupting their reading
- **Expected behavior**: User's scroll position is preserved; auto-scroll only happens when user is already at the bottom

**Example 5: Premature Translation (Flickering)**
- **Current behavior**: Google Meet shows "I think we should...", extension translates to "Eu acho que devemos...", then Meet updates to "I think we should consider the budget", causing re-translation and flickering
- **Expected behavior**: Extension waits 800-1200ms for text to stabilize, then translates "I think we should consider the budget" only once

**Edge Case: Very Long Caption (Truncation)**
- **Current behavior**: Speaker gives a long explanation (800 characters), Google Meet shows it all but translation API fails or truncates due to length
- **Expected behavior**: System breaks long text into chunks or limits displayed text to prevent truncation, with clear indication if text is truncated

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- API selection (Google/Claude/OpenAI) and API key management must continue to work exactly as before
- Target language selection must continue to work exactly as before
- Extension enable/disable (start/stop translation) must continue to work exactly as before
- History export functionality (JSON/TXT) must continue to work exactly as before
- Drag and drop repositioning of translation box must continue to work exactly as before
- Resize functionality of translation box must continue to work exactly as before
- Speaker name display in each caption block must continue to work exactly as before
- Translation caching for reuse must continue to work exactly as before
- Show/hide original text toggle must continue to work exactly as before

**Scope:**
All inputs that do NOT involve caption changes, speaker transitions, or history management should be completely unaffected by this fix. This includes:
- User interactions with popup settings (language, API, show original)
- User interactions with translation box (drag, resize, close, export)
- Background processes (storage, statistics, badge updates)
- Initial setup and configuration loading

## Hypothesized Root Cause

Based on the bug description and code analysis in `content.js`, the most likely issues are:

1. **No Dual-Buffer Architecture**: The current implementation has only one display area for translations. When new captions arrive, they immediately replace the current caption in the UI, causing the previous content to disappear. There is no separation between "live text" (current, changing) and "history text" (finalized, immutable).

2. **No Translation Debouncing**: The `processCaptionChange()` function likely triggers translation immediately when captions change. Google Meet updates captions incrementally as speech-to-text processes audio, so the same caption gets translated multiple times as it evolves (e.g., "I think" → "I think we" → "I think we should"), causing flickering and wasted API calls.

3. **History Management Issues**: 
   - The `getOrCreateHistoryEntryForCaption()` function attempts to update the last history entry when the speaker is the same, but this violates the immutability principle for finalized entries
   - The logic for determining when to create a new entry vs. update an existing one (`shouldUpdateLastHistoryEntry()`) is based on speaker comparison, but doesn't account for whether the entry has already been finalized and moved to history
   - History entries are stored in `translationHistory` array but there's no clear boundary between "pending/live" entries and "finalized/historical" entries

4. **Auto-Scroll Logic**: There is no detection of user scroll position. The system likely auto-scrolls to the bottom whenever new content arrives, regardless of whether the user is actively reading past translations.

5. **Caption Change Detection**: The system likely treats every caption update from Google Meet as a new caption, rather than distinguishing between "incremental updates to the same caption" and "new caption from different context (speaker change, topic change)".

6. **No Stability Detection**: There is no mechanism to detect when a caption has "stabilized" (stopped changing), which would be the appropriate time to finalize it and move it to history.

## Correctness Properties

Property 1: Bug Condition - Dual-Buffer Display with Debounced Translation

_For any_ caption event where text is still changing or has changed within the debounce period (800-1200ms), the system SHALL display the text in the "live text" buffer without translating, and SHALL only translate and finalize to history after the text has been stable for the full debounce period. When finalized, the translation SHALL be moved to the "history text" buffer as an immutable, append-only entry.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - Non-Caption Functionality

_For any_ user interaction or system operation that does NOT involve caption changes, speaker transitions, or history display (such as API selection, language selection, drag/drop, resize, export, enable/disable, show original toggle), the system SHALL produce exactly the same behavior as the original code, preserving all existing functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `content.js`

**Function Area 1: State Management (Add New State Variables)**

**Specific Changes**:
1. **Add Live Buffer State**: Add state variables to track the current "live" caption that hasn't been finalized yet:
   ```javascript
   let liveCaption = { text: '', speaker: '', timestamp: null };
   let liveTranslation = '';
   let liveDebounceTimer = null;
   let captionStableTime = null;
   ```

2. **Add Finalization Tracking**: Add a flag to distinguish between "pending" history entries (can be updated) and "finalized" history entries (immutable):
   ```javascript
   // Modify translationHistory entry structure to include:
   // { ...existingFields, isFinalized: boolean }
   ```

3. **Add Scroll Position Tracking**: Add state to track whether user is at bottom of history scroll:
   ```javascript
   let isUserAtBottom = true;
   let historyScrollContainer = null;
   ```

**Function Area 2: Caption Processing (New Debounce Logic)**

**Specific Changes**:
1. **Modify `processCaptionChange()`**: Change the caption processing flow to:
   - Update the live buffer immediately (no translation)
   - Clear and restart the debounce timer
   - Only trigger `finalizeCaption()` after text is stable for debounce period

2. **Create `finalizeCaption()` Function**: New function that:
   - Moves current live caption to history
   - Triggers translation for the finalized caption
   - Creates a new history entry marked as `isFinalized: true`
   - Clears the live buffer

3. **Modify `translate()` Function**: Add session token validation to ignore responses from old sessions

**Function Area 3: History Management (Immutable Append-Only)**

**Specific Changes**:
1. **Modify `getOrCreateHistoryEntryForCaption()`**: Change logic to:
   - Only update the last entry if it's NOT finalized (`isFinalized: false`)
   - If last entry is finalized, always create a new entry
   - Speaker comparison only matters for non-finalized entries

2. **Modify `updateHistoryEntryById()`**: Add check to prevent updates to finalized entries:
   ```javascript
   if (entry.isFinalized) {
     console.warn('Cannot update finalized history entry');
     return null;
   }
   ```

3. **Modify `createPendingHistoryEntry()`**: All new entries start with `isFinalized: false`, only set to `true` by `finalizeCaption()`

**Function Area 4: UI Rendering (Dual-Buffer Display)**

**Specific Changes**:
1. **Modify `createTranslationBox()` HTML**: Update the HTML structure to have two distinct sections:
   - **Live Section**: Shows current caption and translation status
   - **History Section**: Shows finalized, scrollable list of past translations

2. **Create `updateLiveBuffer()` Function**: New function that updates only the live display area with current caption (no translation yet)

3. **Create `updateHistoryBuffer()` Function**: New function that appends finalized entries to the history display

4. **Modify `renderHistoryList()`**: Change to only render finalized entries (`isFinalized: true`)

**Function Area 5: Smart Auto-Scroll**

**Specific Changes**:
1. **Create `trackScrollPosition()` Function**: Add scroll event listener to history container:
   ```javascript
   historyScrollContainer.addEventListener('scroll', () => {
     const isAtBottom = 
       historyScrollContainer.scrollHeight - historyScrollContainer.scrollTop 
       <= historyScrollContainer.clientHeight + 50; // 50px threshold
     isUserAtBottom = isAtBottom;
   });
   ```

2. **Modify `appendHistoryItem()` Function**: Only auto-scroll if `isUserAtBottom === true`

3. **Add Manual Scroll-to-Bottom Button**: Add a button that appears when `isUserAtBottom === false` to let user manually jump to latest

**Function Area 6: Speaker Change Detection**

**Specific Changes**:
1. **Modify Caption Observer**: Enhance the MutationObserver callback to detect speaker name changes and trigger immediate finalization:
   ```javascript
   if (newSpeaker !== liveCaption.speaker && liveCaption.text !== '') {
     // Speaker changed, finalize current caption immediately
     finalizeCaption();
   }
   ```

**Function Area 7: Text Length Handling**

**Specific Changes**:
1. **Add Text Length Validation**: In `finalizeCaption()`, check text length and truncate or split if needed:
   ```javascript
   const MAX_TEXT_LENGTH = 500;
   if (text.length > MAX_TEXT_LENGTH) {
     text = text.substring(0, MAX_TEXT_LENGTH) + '...';
     // Add visual indicator that text was truncated
   }
   ```

### Implementation Summary

The fix requires modifying several interconnected areas of `content.js`:
- **State management**: Add live buffer tracking, finalization flags, and scroll position tracking
- **Caption processing**: Implement debounced finalization instead of immediate translation
- **History management**: Enforce immutability for finalized entries, append-only behavior
- **UI rendering**: Create dual-buffer display with separate live and history sections
- **Auto-scroll**: Implement smart scroll that respects user reading position
- **Speaker detection**: Trigger immediate finalization on speaker changes
- **Text handling**: Add length validation and truncation for long captions

The key insight is that the current system tries to use a single data structure (translationHistory) and a single display area for both "live, changing" content and "finalized, historical" content. The fix separates these concerns completely.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fix works correctly and preserves existing behavior. Since this is a UX-focused bugfix with timing-dependent behavior, testing will combine automated unit tests for logic with manual exploratory testing for UX validation.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate rapid caption changes, speaker transitions, and user interactions with unfixed code. Observe failures that confirm the bugs exist. Use manual testing in a real Google Meet session to observe the actual UX issues.

**Test Cases**:
1. **Rapid Caption Change Test**: Simulate Google Meet sending incremental caption updates ("Hello" → "Hello everyone" → "Hello everyone, welcome") within 500ms intervals, observe that old translations disappear and translation triggers multiple times (will fail on unfixed code)
2. **Speaker Transition Test**: Simulate Speaker A caption followed immediately by Speaker B caption, observe that both get mixed into one history entry (will fail on unfixed code)
3. **History Overwrite Test**: Create 3 history entries, simulate new caption arrival, observe that the last entry gets overwritten instead of appending (will fail on unfixed code)
4. **Auto-Scroll Interruption Test**: Create history with 10 entries, scroll user to top, simulate new caption, observe that scroll position jumps to bottom (will fail on unfixed code)
5. **Premature Translation Test**: Simulate caption that changes 3 times within 1 second, count number of translation API calls, observe multiple calls for the same evolving caption (will fail on unfixed code)
6. **Long Text Handling Test**: Simulate a caption with 800 characters, observe truncation or incomplete translation (may fail on unfixed code)

**Expected Counterexamples**:
- Translation API is called multiple times for the same caption as it evolves
- Previous translations disappear from view when new captions arrive
- History entries get overwritten or merged incorrectly
- User scroll position is not preserved
- Possible root causes: no debouncing, no dual-buffer architecture, no scroll position tracking, history entries marked as mutable

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleCaptionChange_fixed(input)
  ASSERT expectedBehavior(result)
END FOR

FUNCTION expectedBehavior(result)
  IF input.type == "rapid_caption_change" THEN
    ASSERT liveBuffer.text == input.text
    ASSERT liveBuffer.translation == ""  // Not translated yet
    ASSERT historyBuffer.lastEntry.text != input.text  // Old entry unchanged
  END IF
  
  IF input.type == "caption_stable" THEN
    ASSERT historyBuffer contains new finalized entry
    ASSERT entry.isFinalized == true
    ASSERT entry.translation != ""  // Translation completed
  END IF
  
  IF input.type == "speaker_change" THEN
    ASSERT historyBuffer.length increased by 1
    ASSERT lastEntry.speaker != previousEntry.speaker
  END IF
  
  IF input.type == "user_scrolled_up" THEN
    ASSERT scrollPosition == userScrollPosition  // Position preserved
    ASSERT autoScroll == false
  END IF
  
  RETURN all assertions passed
END FUNCTION
```

**Test Implementation**:
- **Unit tests**: Test debounce logic, finalization logic, history append behavior, scroll position detection
- **Integration tests**: Test complete caption processing flow from observation to translation to history
- **Manual tests**: Test in real Google Meet session with actual captions and translations

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleUserAction_original(input) = handleUserAction_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for all non-caption interactions, then write property-based tests capturing that behavior. Verify that fixed code produces identical results.

**Test Cases**:
1. **API Selection Preservation**: Observe that changing API type (Google/Claude/OpenAI) updates storage and sends message to content script on unfixed code, then verify fixed code does the same
2. **Language Selection Preservation**: Observe that changing target language updates storage and triggers re-translation on unfixed code, then verify fixed code does the same
3. **Drag/Resize Preservation**: Observe that dragging and resizing translation box updates position and size in storage on unfixed code, then verify fixed code does the same
4. **Export Preservation**: Observe that export button downloads JSON/TXT file with history on unfixed code, then verify fixed code does the same
5. **Show Original Toggle Preservation**: Observe that toggling "show original" hides/shows original text section on unfixed code, then verify fixed code does the same
6. **Translation Caching Preservation**: Observe that identical text uses cached translation instead of making new API call on unfixed code, then verify fixed code does the same
7. **Speaker Name Display Preservation**: Observe that speaker names are displayed and highlighted when changed on unfixed code, then verify fixed code does the same
8. **Session Token Validation Preservation**: Observe that stopping translation invalidates pending translations on unfixed code, then verify fixed code does the same

### Unit Tests

**Caption Processing:**
- Test that `processCaptionChange()` updates live buffer without translating
- Test that debounce timer is cleared and restarted on each caption change
- Test that `finalizeCaption()` is called after debounce period expires
- Test that `finalizeCaption()` creates a finalized history entry and triggers translation
- Test that speaker name changes trigger immediate finalization

**History Management:**
- Test that `createPendingHistoryEntry()` creates entries with `isFinalized: false`
- Test that `finalizeCaption()` sets `isFinalized: true`
- Test that `updateHistoryEntryById()` rejects updates to finalized entries
- Test that `getOrCreateHistoryEntryForCaption()` only updates non-finalized entries
- Test that history array grows via append (new entries at end, old entries unchanged)
- Test that history size limit still works (oldest entries removed when limit exceeded)

**Scroll Position:**
- Test that `trackScrollPosition()` correctly detects when user is at bottom
- Test that `appendHistoryItem()` auto-scrolls only when `isUserAtBottom === true`
- Test that scroll position is preserved when `isUserAtBottom === false`

**Text Length:**
- Test that long text (>500 chars) is truncated with ellipsis
- Test that normal text (<500 chars) is not truncated

### Property-Based Tests

**Caption Event Generation:**
- Generate random sequences of caption events (text changes, speaker changes, delays)
- Verify that finalized history entries are never modified after creation
- Verify that translation is only called once per finalized entry
- Verify that history entries are always appended in chronological order

**User Interaction Generation:**
- Generate random user actions (API changes, language changes, drag/resize, export, toggle)
- Verify that all actions produce the same results as the original implementation
- Verify that no user action corrupts history or live buffer state

**Scroll Position Generation:**
- Generate random scroll positions and caption arrivals
- Verify that auto-scroll only occurs when user is at bottom
- Verify that scroll position is preserved when user is scrolled up

### Integration Tests

**Full Translation Flow:**
- Start translation in a mock Google Meet session
- Simulate speaker A saying one sentence (incremental caption updates)
- Wait for stabilization and verify finalized translation appears in history
- Simulate speaker B saying another sentence
- Verify two separate history entries with correct speaker names
- Stop translation and verify all state is cleaned up

**History Persistence:**
- Create 10 history entries
- Reload extension
- Verify all 10 entries are restored with correct finalization state

**Multi-Speaker Conversation:**
- Simulate a conversation with 3 speakers taking turns
- Each speaker says 2-3 sentences
- Verify each sentence becomes a separate history entry
- Verify speaker names are correctly associated with each entry
- Verify history list displays entries in chronological order

**Manual Testing in Real Google Meet:**
- Join a real Google Meet call with multiple speakers
- Enable translation and observe:
  - Live buffer updates as captions change
  - Translations appear after captions stabilize
  - History accumulates without losing entries
  - Scroll position is preserved when reading past entries
  - No flickering or premature translations
  - Speaker transitions create separate history entries
