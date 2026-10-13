# BonaMind native mobile app — Part 2: create a course on the phone

Status: design approved in conversation 2026-10-12; this spec awaits review.
Builds on Part 1 (`2026-10-08-bonamind-native-app-part1-design.md`, merged as
#156). Same design language, same architecture rules.

## 1. Intent

**What the owner asked for.** Turn a **topic, link (web page or YouTube), PDF,
or photo** into a course from the phone, reusing the website's pipeline where
possible, looking as good as Part 1 (Aurora + Paper, iOS-native, animated).

**Decisions made in conversation:**

- All four sources ship in Part 2 (topic, link + YouTube, PDF, photo).
- After generation: **quick review, then save** — swipe away bad cards, tap to
  edit, rename, then save.
- Before generation: **a size picker only** — Quick (~10 cards), Standard
  (~20), Deep (~35). Everything else is automatic.
- **Approach 1:** the server only turns sources into text; the phone chunks the
  text and asks the existing AI endpoint for cards, with prompts and parsing in
  `@bonamind/core`.

**Success looks like:** pick a source, watch a real progress animation, review
the cards, and land on a saved course that is studyable immediately and also
appears on bonamind.app.

**Assumptions (not stated by the owner):** creation needs a connection and an
AI entitlement, like Prof. Linnea; PDFs over ~3 MB are out of scope for v1.

## 2. What exists today

- **Topic → deck**: the website's `generateDeckFromTopic` prompt
  (`auramind-gemini/src/services/api/groqService.ts`) and text → cards
  `generateFlashcards` prompt. Both call the AI proxy and parse JSON from the
  reply. Not reusable from the phone as-is (browser cache, Puter fallback,
  website types).
- **Link / YouTube → text**: `POST /api/fetch-url` and
  `POST /api/fetch-youtube-transcript` (`api/index.ts`), signed-in callers
  only, SSRF-guarded, `ai` rate-limit bucket. Response
  `{ success, data: { text, title, error? } }`.
- **PDF → text**: browser-only (`pdfjs-dist` in
  `services/import/documentImportService.ts`). No server endpoint.
- **Photo → text**: does not exist anywhere.
- **AI proxy** `POST /api/ai/chat` (`api/_aiHandler.ts`): auth, entitlement
  (402 without), per-user rate limit, provider failover. Messages are
  **plain strings capped at 8,000 characters**, at most 30 messages, at most
  8,192 output tokens.
- **Saving**: `decks` (`user_id, name, description, created_at`) and `cards`
  (`user_id, deck_id, front, back, fsrs_state`, …), row-level secured. The
  website seeds each card with `getInitialCardState` and
  `applyPersonalizedDifficultyInit`, both already in `@bonamind/core`.

## 3. Screens and flow

Entry points: a glass **+** button in the Courses tab's large-title header, and
an **Add course** tile on Today when the user has no courses. Both open the
`create` route, presented as a page sheet over the aurora.

1. **New course** (serif title "New course", subtitle "Turn anything into
   cards").
   - Four source tiles in a 2×2 grid, each with an SF Symbol and accent:
     Topic (sparkles, violet), Link or video (link, cyan), PDF (doc.text,
     amber), Photo (camera, pink). The chosen tile lifts and glows; the area
     below morphs (layout transition) into that source's input:
     - **Topic**: one text field ("The French Revolution").
     - **Link or video**: a URL field, prefilled from the clipboard when it
       holds an http(s) URL; a YouTube URL shows a "Video transcript" chip.
     - **PDF**: "Choose a PDF" opens Files (`expo-document-picker`), then shows
       the file name, page count once read, and size.
     - **Photo**: "Take photo" / "Choose photos" (`expo-image-picker`), up to
       5 pages, shown as a row of paper thumbnails; tapping a thumbnail's
       close button removes it. Pages are sent in the order taken.
   - Size segmented control: Quick · Standard · Deep (default Standard).
   - **Make my course** (PrimaryButton). Offline it reads "Connect to make a
     course" and does nothing; without entitlement (after a 402) it reads
     "Part of BonaMind Pro".
2. **Building.** The Part 1 `LoadingScreen` prism, plus a step list that ticks
   real steps with a check and a light haptic: *Reading the page / the PDF /
   your photos* → *Finding key ideas* → *Writing card N of M* with a progress
   bar. Each new card lands on a small paper stack (FadeInDown + spring) so the
   course visibly grows. Leaving the screen does not cancel; returning shows
   the live state.
3. **Review.** Editable serif course title, "N cards · swipe away any you don't
   want". A card deck (Part 1 `CardStack` visuals, its own gesture rules):
   swipe **left = remove** (with an Undo pill for 4 s), **right = keep**, tap
   = flip, long-press = edit (a sheet with Question and Answer fields). A
   "Keep all" shortcut skips to the end. **Save course** is always available.
4. **Ready.** Check mark draws in, confetti burst, success haptic. "Course
   ready · N cards in {title}", note "Also on bonamind.app". **Study now**
   (opens the study route for the new deck) and **Done** (back to Courses,
   where the new course animates in at the top).

Reduce Motion: no confetti, crossfades instead of springs, prism still.

## 4. Architecture

### 4.1 `@bonamind/core` — `packages/core/src/create/`

Platform-free, unit-tested, reusable by the website later.

- `COURSE_SIZES = { quick: 10, standard: 20, deep: 35 }`.
- `splitSource(text, size)` → `{ text, cards }[]`: normalises whitespace,
  splits at paragraph then sentence boundaries into pieces of at most
  `MAX_PIECE_CHARS` (6,000, leaving room for the prompt inside the 8,000
  limit), at most 8 pieces (text beyond that is dropped and reported as
  `truncated: true`). The card target is spread across pieces by length, at
  least 2 per piece.
- `topicPrompt(topic, cards)` and `cardsPrompt(piece, cards, context)`: the
  website's prompts, requesting exactly `cards` items and a JSON-only reply.
  `topicPrompt` asks for `{ title, description, cards }`; `cardsPrompt` asks
  for a card array. `context` carries the source title so pieces stay on topic.
- `parseCards(reply)` → `DraftCard[]` (`{ front, back }`): extracts JSON from
  bare text, ```json fences or chatty wrappers; accepts
  `question/answer` or `front/back`; trims; drops empty sides, sides over
  600 characters, and duplicates (case- and punctuation-insensitive front).
  `parseTopicDeck(reply)` also returns `title` and `description`.
- `buildCourse({ source, size, ask, onProgress, signal })` → `CourseDraft`
  (`{ title, description, cards, truncated }`):
  - `source` is `{ kind: 'topic', topic }` or
    `{ kind: 'text', text, title, label }` (link, video, PDF and photo are all
    text by the time they reach core).
  - `ask(prompt, signal)` is injected: one call to `/api/ai/chat`, returns the
    reply text. Core never knows about fetch or tokens.
  - Topic: one `topicPrompt` call (Deep: two calls, the second asking for cards
    not already covered, fronts passed as context).
  - Text: one `cardsPrompt` call per piece, sequentially.
  - A call that throws a retryable error or returns unparseable output is
    retried once; a second failure skips that piece. 429 waits 3 s then 8 s
    before giving up on the piece. 402 and 401 abort the whole build.
  - Cross-piece dedupe, then a cap at the target size.
  - Zero cards at the end → throws `CreateError('empty')`.
  - `onProgress` events: `{ step: 'reading' | 'ideas' | 'writing' | 'done',
    cardsSoFar, target, latest?: DraftCard }`.
- `CreateError` kinds: `offline`, `subscription`, `rate_limited`,
  `unreadable` (source had no usable text), `too_large`, `empty`, `busy`.
- `createCourse(client, userId, draft, personalization)` (in
  `src/data/queries.ts`, next to the Part 1 queries): inserts the `decks` row
  (`name`, `description`), then all cards in one insert with
  `getInitialCardState` + `applyPersonalizedDifficultyInit` (same as the
  website's `saveCards`). If the card insert fails it deletes the deck and
  rethrows, so no empty course is ever left behind. Returns `{ deck, cards }`
  as core `Deck`/`Card`.

### 4.2 API — two endpoints in `api/index.ts`

Both: `POST`, Bearer auth (401), entitlement through
`isEntitledWithRoleAccess` (402, same as `/api/ai/chat`), `ai` rate-limit
bucket, JSON in and out, `{ success: true, data: { text, title?, pages? } }`
or `{ error, code }`. Added to the router and `RATE_LIMIT_BUCKETS`.

- **`/api/extract/document`**: body `{ name, data }` (base64). Rejects over
  3 MB decoded (413, `too_large`) and anything that isn't a PDF by magic bytes
  (415). Extracts text with **`unpdf`** (pdf.js packaged for serverless,
  new dependency in `api/`). Caps output at 60,000 characters. A PDF with no
  extractable text returns 422 `no_text` (scanned PDFs: the app suggests Photo).
- **`/api/extract/image`**: body `{ images: string[] }` (1–5 JPEG base64,
  each ≤ 1.5 MB decoded). Sends one request to the Gemini provider's
  OpenAI-compatible endpoint with `image_url` data URIs and a transcription
  instruction ("transcribe all text, including handwriting and diagrams'
  labels; output plain text only"). Model from `GEMINI_VISION_MODEL`, defaulting to
  `gemini-2.0-flash` (the provider's existing default, which accepts images); 503 `unavailable` when no Gemini key is configured. No
  text found returns 422 `no_text`.

Vercel's request body limit (~4.5 MB) bounds both; the phone enforces the same
limits before uploading so the user gets the message without a round trip.

### 4.3 `mobile/` — `src/create/`

- **Route** `src/app/create.tsx` (inside `Stack.Protected guard={signedIn}`,
  `presentation: 'modal'`, own night background + aurora like the Linnea
  sheet).
- **`sources.ts`**: per-kind readers returning core `source` objects:
  - topic → `{ kind: 'topic' }`;
  - link → `/api/fetch-url` or `/api/fetch-youtube-transcript` (YouTube host
    detection) → `{ kind: 'text' }`;
  - PDF → `expo-document-picker` → `expo-file-system` base64 → size check →
    `/api/extract/document`;
  - photo → `expo-image-picker` → `expo-image-manipulator` (longest side
    1,600 px, JPEG 0.7) → `/api/extract/image`.
  - All requests go to `env.apiBaseUrl` with the session token read at request
    time (same as Linnea's `tokenStream`) and a 45 s timeout.
- **`ask.ts`**: `ask(prompt, signal)` → `POST /api/ai/chat`
  (`{ messages: [{ role: 'user', content }], temperature: 0.4, max_tokens: 4096 }`),
  maps HTTP status to `CreateError` kinds, 45 s timeout.
- **`useCreateStore`** (zustand, in memory): the single active build — phase
  (`input | reading | building | review | saving | ready | error`), progress,
  draft, chosen source and size. Lives outside the screens so leaving and
  returning keeps the build. One build at a time.
- **Screens/components**: `CreateScreen` (tiles, inputs, size control),
  `BuildingView`, `ReviewDeck` (its own swipe card, reusing `CardStack`'s
  visual styles), `EditCardSheet`, `ReadyView`. New `SegmentedControl` design
  component (glass track on iOS 26, sliding pill animation).
- **After save**: `queryClient.invalidateQueries` for `decks` and `cards`; the
  Courses list highlights the new deck once.
- **Entry points**: Courses header glass **+**; Today empty-state tile.
- **New Expo modules** (all available in Expo Go, installed at SDK 57's
  expected versions): `expo-document-picker`, `expo-image-picker`,
  `expo-image-manipulator`, `expo-file-system`, `expo-clipboard`. The photo
  picker needs `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`
  strings in `app.config.ts` ("BonaMind reads your notes to make cards").

## 5. Errors and edge cases

| Situation | What the user sees |
|---|---|
| Offline before starting | Button reads "Connect to make a course", disabled |
| Connection lost mid-build | Build pauses at the current piece with "Waiting for a connection"; resumes automatically when online (NetInfo); the draft so far is kept |
| 402 | "Making courses is part of BonaMind Pro." |
| 429 | Automatic retry (3 s, 8 s); then "Give it a minute and try again." |
| Link unreadable / no transcript | "Couldn't read that page. Try another link or paste the text." (with a "Paste text instead" action that switches to a free-text Topic-like field treated as `kind: 'text'`) |
| PDF > 3 MB | "That PDF is too big for now (3 MB max)." |
| PDF without text | "That PDF is images only. Snap the pages with Photo instead." |
| Photo without text | "Couldn't find text in that photo. Try a sharper, closer shot." |
| One piece fails twice | Skipped silently; the course is built from the rest; if `truncated` or pieces were skipped, review shows "Made from part of your PDF" |
| Zero cards | "Couldn't make cards from that. Try a different source." |
| Save fails | Reviewed cards stay in the store; "Try saving again"; no deck is left behind (core rollback) |
| A call hangs | 45 s timeout counts as a failure → retry once → skip |

All copy lives in `mobile/src/create/copy.ts` and follows the Part 1 voice.

## 6. Testing

- **Core (Vitest, `packages/core/test/`)**: `splitSource` (short text, long
  text at boundaries, no paragraph breaks, multibyte text, the 8-piece cap and
  `truncated`, card distribution); `parseCards` (bare JSON, fenced, chatty
  wrapper, `question/answer` vs `front/back`, broken JSON, empties, oversize,
  duplicates); `buildCourse` with a scripted `ask` (progress order, retry then
  skip, 429 backoff with fake timers, 402 abort, zero → `empty`, dedupe and
  cap, Deep topic's second call); `createCourse` with a fake Supabase client
  (row shapes, personalized init applied, rollback on card-insert failure).
- **API (Vitest, `api/tests/`)**: both endpoints → 401 without a token, 402
  without entitlement, 413/415 limits; document extraction against a small
  committed fixture PDF; image extraction with the provider fetch mocked
  (request shape: data URIs, model, instruction) and the `no_text` path.
- **Mobile (Jest + RNTL)**: create screen (tile switches input, clipboard
  prefill, size control, offline and 402 button states); building view renders
  store progress; review deck (swipe left removes with Undo, edit sheet saves,
  rename); save success → ready, save failure → retry kept; `ask.ts` status
  mapping; source readers' size checks. Gestures tested with
  `react-native-gesture-handler/jest-utils` as in Part 1.
- **Device**: one course from each source in Expo Go on the owner's iPhone.

## 7. Success criteria

1. Each of the four sources produces a saved course on a real iPhone in Expo
   Go, visible on bonamind.app afterwards.
2. Progress reflects real steps; the build survives leaving and returning to
   the screen.
3. Removing and editing cards in review is reflected in the saved course.
4. No failure path leaves an empty deck or loses reviewed cards.
5. Core, API and mobile suites green; `tsc` and lint clean in all three.

## 8. Risks and open items

- **Gemini vision model availability** on the free tier may change; the model
  is an env var (`GEMINI_VISION_MODEL`) so it can be swapped without code.
- **Free-tier AI quality** varies by provider failover; `parseCards` and the
  retry-then-skip rule absorb malformed replies, review catches bad cards.
- **Large PDFs** (> 3 MB) and scanned textbooks are out of scope; the clear
  route later is uploading to Supabase Storage and extracting server-side.
- **Apex vs www host** (HANDOFF outstanding item 11) affects the new endpoints
  exactly as it does Linnea; the app already calls `www.bonamind.app`.
- The website keeps its own generator for now; switching it to core's
  `buildCourse` is a later, separate change.

## 9. Out of scope for Part 2

Share-sheet / share-extension intake (needs a development build), PowerPoint,
audio and voice recordings, PDFs over 3 MB, editing courses after saving
(beyond the review step), course images/covers, multiple simultaneous builds,
and changing the website's generator.
