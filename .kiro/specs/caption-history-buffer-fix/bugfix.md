# Bugfix Requirements Document

## Introduction

This document addresses critical UX issues in the Google Meet translation extension related to caption management, history handling, and translation timing. The current implementation causes confusion when multiple speakers talk, loses context when text changes rapidly, breaks history functionality, and truncates long text. This fix implements a dual-buffer system with debounced translation to ensure users never lose information and can always read past and present captions.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN multiple speakers talk in quick succession THEN the system mixes captions together making it impossible to distinguish between speakers

1.2 WHEN text changes rapidly (live captions updating) THEN old translations disappear before users can read them causing context loss

1.3 WHEN a user attempts to read past translations THEN the history feature is broken and does not show previous translations reliably

1.4 WHEN captions contain long text THEN the text gets cut or replaced before translation completes resulting in incomplete translations

1.5 WHEN live captions are still being modified by Google Meet THEN the system translates incomplete or changing text causing flickering and wasted API calls

1.6 WHEN text is moved to history THEN the system overwrites or deletes old translations instead of appending them

1.7 WHEN a user scrolls up to read history THEN the system auto-scrolls to the bottom interrupting the reading experience

1.8 WHEN the current caption block is still visible THEN new text overwrites it immediately causing jarring visual updates

### Expected Behavior (Correct)

2.1 WHEN captions change rapidly indicating a potential speaker change THEN the system SHALL create separate history blocks for each distinct caption segment

2.2 WHEN text has been stable for approximately 1 second THEN the system SHALL move the text from "live text" buffer to "history text" buffer and finalize it as immutable

2.3 WHEN displaying captions THEN the system SHALL implement a dual-buffer system with "live text" (changing) and "history text" (final, never changes) sections

2.4 WHEN text becomes stable THEN the system SHALL debounce translation with 800-1200ms delay to only translate stable text

2.5 WHEN long text exceeds a reasonable length THEN the system SHALL break it into manageable parts or limit size before translation to prevent truncation

2.6 WHEN new history entries are created THEN the system SHALL append them to history without deleting or overwriting old translations (append-only)

2.7 WHEN a user is scrolled at the bottom of the history THEN the system SHALL auto-scroll to show new content

2.8 WHEN a user has scrolled up to read history THEN the system SHALL NOT auto-scroll and SHALL preserve the user's reading position

2.9 WHEN displaying history THEN the system SHALL keep the last 2-3 blocks visible and SHALL NOT overwrite the current view immediately

2.10 WHEN displaying captions THEN the system SHALL provide clear UI showing [ORIGINAL] and [TRANSLATION] sections separately

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user selects a target language THEN the system SHALL CONTINUE TO translate to that language

3.2 WHEN a user selects a translation API (Google/Claude/OpenAI) THEN the system SHALL CONTINUE TO use that API for translations

3.3 WHEN a user enables or disables the extension THEN the system SHALL CONTINUE TO start and stop translation accordingly

3.4 WHEN a user exports history THEN the system SHALL CONTINUE TO export all translations in the requested format

3.5 WHEN a user configures API keys THEN the system SHALL CONTINUE TO store and use those keys for translation

3.6 WHEN the translation box is dragged or resized THEN the system SHALL CONTINUE TO remember and restore the position and size

3.7 WHEN captions have speaker names THEN the system SHALL CONTINUE TO display the speaker name for each caption block

3.8 WHEN translations complete successfully THEN the system SHALL CONTINUE TO cache them for reuse

3.9 WHEN the user toggles "show original text" THEN the system SHALL CONTINUE TO show or hide the original text accordingly
