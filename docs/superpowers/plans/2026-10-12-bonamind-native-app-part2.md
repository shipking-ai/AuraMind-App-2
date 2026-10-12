# BonaMind Native App Part 2 (Create a Course) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a topic, link/YouTube, PDF or photo into a reviewed, saved course from the phone.

**Architecture:** The server only turns sources into text (existing `fetch-url` / `fetch-youtube-transcript`, new `extract/document` and `extract/image`). `@bonamind/core` splits text, prompts the existing `/api/ai/chat`, parses cards and saves the course. `mobile/src/create/` holds the readers, an app-wide build store and four screens.

**Tech Stack:** TypeScript, Vitest (core, api), Expo SDK 57 / RN 0.86, Jest + RNTL 14, zustand, Reanimated 4, gesture-handler, `unpdf` (api), Gemini OpenAI-compatible API.

**Spec:** `docs/superpowers/specs/2026-10-12-bonamind-native-app-part2-create-design.md`

## Global Constraints

- Branch `feat/native-app-part2`; Conventional Commits; **no AI attribution lines** (no Co-Authored-By, no generated-by footers) in commits or PRs.
- Every fix updates `HANDOFF.md` in the same commit (owner rule).
- `@bonamind/core` stays platform-free: `test/noPlatformApis.test.ts` must stay green (no fetch, DOM, RN, Buffer).
- Sizes: `quick: 10`, `standard: 20`, `deep: 35`. `MAX_PIECE_CHARS = 6000`, at most 8 pieces, at least 2 cards per piece.
- Card sides over 600 characters are dropped. PDF ≤ 3 MB decoded; images 1–5, each ≤ 1.5 MB decoded, resized to longest side 1,600 px, JPEG quality 0.7; document text capped at 60,000 characters.
- Every network call from the phone has a 45 s timeout; `ask` posts `temperature: 0.4, max_tokens: 4096`.
- New endpoints: Bearer auth (401), `isEntitledWithRoleAccess` (402), `ai` rate-limit bucket. Gemini vision model from `GEMINI_VISION_MODEL`, default `gemini-2.0-flash`.
- Mobile Expo modules are installed with plain `npm install` at the versions `npx expo install --check` expects (this machine's npm policy breaks `npx expo install`). After installing, `npx expo install --check` must print "Dependencies are up to date".
- All user-facing copy for creation lives in `mobile/src/create/copy.ts`, verbatim from spec §5.
- Bash heredocs strip backslashes on this machine: write files containing `\n` or regexes with the editor tools.

## Review Focus

1. **One giant paragraph** (a page fetch with no blank lines): `splitSource` must fall back to sentence, then hard cuts, never exceeding 6,000 chars. → Task 1 test `splits text with no paragraph breaks`.
2. **Tapping "Make my course" twice fast**: only one build runs. → Task 8 test `ignores a second start while building`.
3. **Leaving the building screen and coming back**: progress continues and is shown. → Task 8 test `keeps building after the screen unmounts`.
4. **Clipboard holds plain text, not a URL**: the link field stays empty. → Task 9 test `prefills only http(s) URLs from the clipboard`.
5. **Photos in HEIC from the iPhone camera**: always uploaded as JPEG. → Task 7 test `resizes photos to a 1600px JPEG`.

---

### Task 1: Core — split source text

**Files:**
- Create: `packages/core/src/create/split.ts`
- Modify: `packages/core/src/index.ts` (add `export * from './create/split'`)
- Test: `packages/core/test/createSplit.test.ts`

**Interfaces:**
- Produces: `type CourseSize = 'quick' | 'standard' | 'deep'`; `COURSE_SIZES: Record<CourseSize, number>`; `MAX_PIECE_CHARS = 6000`; `MAX_PIECES = 8`; `splitSource(text: string, target: number): { pieces: { text: string; cards: number }[]; truncated: boolean }`.

- [ ] **Step 1: Write the failing tests**

```ts
it('keeps short text as one piece with the whole target', () => {
  expect(splitSource('Mitochondria make ATP.', 20)).toEqual({ pieces: [{ text: 'Mitochondria make ATP.', cards: 20 }], truncated: false });
});
it('splits at paragraph breaks under the piece limit', () => {
  const para = 'A'.repeat(4000);
  const { pieces } = splitSource(`${para}\n\n${para}\n\n${para}`, 20);
  expect(pieces.length).toBe(3);
  expect(pieces.every((p) => p.text.length <= MAX_PIECE_CHARS)).toBe(true);
  expect(pieces.reduce((n, p) => n + p.cards, 0)).toBe(20);
});
it('splits text with no paragraph breaks', () => {
  const text = 'This is one sentence. '.repeat(1000); // 22,000 chars, no blank lines
  const { pieces } = splitSource(text, 35);
  expect(pieces.every((p) => p.text.length <= MAX_PIECE_CHARS && p.text.length > 0)).toBe(true);
  expect(pieces.every((p) => /\.$/.test(p.text))).toBe(true); // cut at sentence ends
});
it('caps at 8 pieces and reports truncation', () => {
  const r = splitSource('word '.repeat(20000), 35);
  expect(r.pieces.length).toBe(MAX_PIECES);
  expect(r.truncated).toBe(true);
});
it('gives every piece at least 2 cards', () => {
  const { pieces } = splitSource(`${'A'.repeat(5900)}\n\n${'B'.repeat(50)}`, 10);
  expect(Math.min(...pieces.map((p) => p.cards))).toBeGreaterThanOrEqual(2);
});
it('collapses runs of whitespace and keeps multibyte text intact', () => {
  expect(splitSource('Ça   va\t\tbien 🙂', 10).pieces[0].text).toBe('Ça va bien 🙂');
});
```

- [ ] **Step 2: Run** `cd packages/core && npx vitest run test/createSplit.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `splitSource`** — normalise spaces/tabs per line (keep blank-line paragraph breaks), greedy-pack paragraphs; a paragraph over the limit is split at `. ! ?` boundaries, a sentence over the limit is hard-cut. Cards are distributed proportionally to piece length (largest-remainder), floor 2.
- [ ] **Step 4: Run** the test — Expected: PASS. Also `npx vitest run test/noPlatformApis.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(core): split long sources into AI-sized pieces`

### Task 2: Core — prompts and card parsing

**Files:**
- Create: `packages/core/src/create/prompts.ts`, `packages/core/src/create/parse.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/createParse.test.ts`

**Interfaces:**
- Produces: `interface DraftCard { front: string; back: string }`; `MAX_SIDE_CHARS = 600`; `topicPrompt(topic: string, cards: number, avoid?: string[]): string`; `cardsPrompt(piece: string, cards: number, context: string): string`; `parseCards(reply: string): DraftCard[]`; `parseTopicDeck(reply: string): { title: string; description: string; cards: DraftCard[] } | null`; `dedupeCards(cards: DraftCard[]): DraftCard[]` (normalised key: lowercase front, punctuation and spaces stripped).

- [ ] **Step 1: Write the failing tests**

```ts
it('reads a bare JSON array', () => {
  expect(parseCards('[{"question":"Q1","answer":"A1"}]')).toEqual([{ front: 'Q1', back: 'A1' }]);
});
it('reads fenced and chatty replies', () => {
  expect(parseCards('Sure!\n```json\n[{"front":"Q","back":"A"}]\n```\nHope it helps')).toEqual([{ front: 'Q', back: 'A' }]);
});
it('returns [] for broken JSON instead of throwing', () => {
  expect(parseCards('[{"question": "Q1", "answer": ')).toEqual([]);
});
it('drops empty, oversize and duplicate cards and trims', () => {
  const long = 'x'.repeat(601);
  const reply = JSON.stringify([
    { question: '  What is ATP? ', answer: ' Energy ' }, { question: 'what is atp', answer: 'dup' },
    { question: '', answer: 'A' }, { question: 'Q', answer: long },
  ]);
  expect(parseCards(reply)).toEqual([{ front: 'What is ATP?', back: 'Energy' }]);
});
it('reads a topic deck object', () => {
  const reply = 'Here:\n{"title":"Cells","description":"Basics","cards":[{"question":"Q","answer":"A"}]}';
  expect(parseTopicDeck(reply)).toEqual({ title: 'Cells', description: 'Basics', cards: [{ front: 'Q', back: 'A' }] });
});
it('asks for exactly N cards as JSON only', () => {
  expect(cardsPrompt('text', 7, 'Biology')).toMatch(/exactly 7/);
  expect(topicPrompt('Cells', 12, ['What is ATP?'])).toMatch(/What is ATP\?/);
});
```

- [ ] **Step 2: Run** `npx vitest run test/createParse.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — prompts adapted from the website's `generateFlashcards` / `generateDeckFromTopic` (`auramind-gemini/src/services/api/groqService.ts`), each stating "exactly N", JSON-only output, `question`/`answer` keys; `topicPrompt` lists `avoid` fronts as "do not repeat". Parser: try `JSON.parse` on the fenced block, then on the outermost `[...]` / `{...}` span; map `question|front` and `answer|back`; apply trim/limits; then `dedupeCards`.
- [ ] **Step 4: Run** — Expected: PASS (and `noPlatformApis` PASS).
- [ ] **Step 5: Commit** `feat(core): course prompts and a forgiving card parser`

### Task 3: Core — build a course

**Files:**
- Create: `packages/core/src/create/build.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/createBuild.test.ts`

**Interfaces:**
- Consumes: Task 1 `splitSource`, `COURSE_SIZES`; Task 2 prompts, parsers, `dedupeCards`.
- Produces:
  - `type CreateErrorKind = 'offline' | 'subscription' | 'rate_limited' | 'unreadable' | 'too_large' | 'empty' | 'busy'`; `class CreateError extends Error { kind: CreateErrorKind; partial?: { donePieces: number; cards: DraftCard[] } }` (`partial` is set by `buildCourse` when it stops on `offline`).
  - `type CourseSource = { kind: 'topic'; topic: string } | { kind: 'text'; text: string; title: string; label: string }`.
  - `type AskFn = (prompt: string, signal?: AbortSignal) => Promise<string>` (throws `CreateError`).
  - `interface BuildProgress { step: 'reading' | 'ideas' | 'writing' | 'done'; cardsSoFar: number; target: number; latest?: DraftCard }`.
  - `interface CourseDraft { title: string; description: string; cards: DraftCard[]; truncated: boolean; skippedPieces: number }`.
  - `buildCourse(opts: { source: CourseSource; size: CourseSize; ask: AskFn; onProgress?: (p: BuildProgress) => void; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; resume?: { donePieces: number; cards: DraftCard[] } }): Promise<CourseDraft>`.

- [ ] **Step 1: Write the failing tests** (scripted `ask` returning queued replies or throwing; `sleep` injected as a resolved spy)

```ts
it('builds a topic course from one call', async () => {
  const ask = scripted(JSON.stringify({ title: 'Cells', description: 'd', cards: cardsJson(20) }));
  const d = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'standard', ask });
  expect(d.title).toBe('Cells'); expect(d.cards).toHaveLength(20);
});
it('makes a second, non-repeating call for a deep topic', async () => {
  const ask = scripted(deckJson(20, 'a'), cardsArrayJson(15, 'b'));
  const d = await buildCourse({ source: { kind: 'topic', topic: 'Cells' }, size: 'deep', ask });
  expect(ask).toHaveBeenCalledTimes(2);
  expect(ask.mock.calls[1][0]).toMatch(/a-1/); // first call's fronts passed as avoid list
  expect(d.cards).toHaveLength(35);
});
it('reports progress in order and per card', async () => { /* steps: reading → ideas → writing… → done; cardsSoFar increases */ });
it('retries a bad piece once, then skips it', async () => {
  const ask = scripted('not json', 'still not json', cardsArrayJson(10, 'b'));
  const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask });
  expect(d.skippedPieces).toBe(1); expect(d.cards.length).toBeGreaterThan(0);
});
it('waits 3s then 8s on rate limits before skipping', async () => {
  const sleep = vi.fn(async () => {});
  const ask = scripted(rate(), rate(), rate(), cardsArrayJson(10, 'b'));
  await buildCourse({ source: twoPieceText(), size: 'standard', ask, sleep });
  expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 8000]);
});
it('aborts the whole build on 402', async () => {
  await expect(buildCourse({ source: twoPieceText(), size: 'standard', ask: scripted(sub()) })).rejects.toMatchObject({ kind: 'subscription' });
});
it('fails with empty when no piece yields cards', async () => {
  await expect(buildCourse({ source: twoPieceText(), size: 'quick', ask: scripted('x', 'x', 'x', 'x') })).rejects.toMatchObject({ kind: 'empty' });
});
it('dedupes across pieces and caps at the target', async () => { /* two pieces returning overlapping fronts → unique, ≤ target */ });
it('carries truncation from splitSource', async () => { /* 8+ pieces of text → truncated true */ });
it('stops on offline with the cards so far, and resumes after the last finished piece', async () => {
  const err = await buildCourse({ source: twoPieceText(), size: 'standard', ask: scripted(cardsArrayJson(10, 'a'), offline()) }).catch((e) => e);
  expect(err).toMatchObject({ kind: 'offline', partial: { donePieces: 1 } });
  const ask = scripted(cardsArrayJson(10, 'b'));
  const d = await buildCourse({ source: twoPieceText(), size: 'standard', ask, resume: err.partial });
  expect(ask).toHaveBeenCalledTimes(1); expect(d.cards).toHaveLength(20);
});
```

- [ ] **Step 2: Run** `npx vitest run test/createBuild.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `buildCourse`** — sequential per piece; on `CreateError` with `kind: 'rate_limited'` sleep 3000 then 8000 (retry after each) before skipping; `busy` or parse-empty: one retry then skip; `subscription`/`offline` rethrow; text title = `source.title`, description = `From ${source.label}`; topic description from the model. Emit `reading` and `ideas` before the first call.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): build a course draft from any source`

### Task 4: Core — save a course

**Files:**
- Modify: `packages/core/src/data/queries.ts` (new export, not added to `BonaMindData`)
- Test: `packages/core/test/createCourse.test.ts` (uses `test/fakeSupabase.ts`; extend it with `delete` if missing)

**Interfaces:**
- Consumes: `getInitialCardState`, `applyPersonalizedDifficultyInit`, `mapDeckRow`, `mapCardRow`, Task 3 `CourseDraft`.
- Produces: `createCourse(client: SupabaseClient, userId: string, draft: Pick<CourseDraft, 'title' | 'description' | 'cards'>, personalization: { profileLabel: string | null; weightsOverride?: number[] }): Promise<{ deck: Deck; cards: Card[] }>`.

- [ ] **Step 1: Write the failing tests**

```ts
it('inserts the deck then all cards with initial FSRS state', async () => {
  const { deck, cards } = await createCourse(fake, 'u1', draft(3), { profileLabel: null });
  expect(fake.inserted('decks')).toEqual([expect.objectContaining({ user_id: 'u1', name: 'Cells', description: 'd' })]);
  expect(fake.inserted('cards')).toHaveLength(3);
  expect(fake.inserted('cards')[0]).toEqual(expect.objectContaining({ user_id: 'u1', deck_id: deck.id, front: 'Q1', back: 'A1', fsrs_state: expect.any(String) }));
  expect(cards).toHaveLength(3);
});
it('applies personalized difficulty when a profile is known', async () => { /* profileLabel 'fast-learner' changes fsrs_state difficulty vs null */ });
it('deletes the deck when the card insert fails', async () => {
  fake.failNext('cards');
  await expect(createCourse(fake, 'u1', draft(3), { profileLabel: null })).rejects.toThrow();
  expect(fake.deleted('decks')).toEqual([expect.any(String)]);
});
```

- [ ] **Step 2: Run** `npx vitest run test/createCourse.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — row shapes match the website's `deckService.createDeck` / `cardService.saveCards` (`decks.name`, `cards.fsrs_state` JSON string).
- [ ] **Step 4: Run** the whole core suite `npx vitest run && npx tsc --noEmit` — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(core): save a course with rollback`

### Task 5: API — extract text from a PDF

**Files:**
- Modify: `api/index.ts` (router `case 'extract'`, `RATE_LIMIT_BUCKETS.extract = 'ai'`, `handleExtract(req, res, action)`), `api/package.json` (`unpdf`)
- Create: `api/_lib/extract.ts` (`decodeBase64Limited`, `isPdf`, `pdfText`), `api/tests/fixtures/two-pages.pdf` (tiny text PDF)
- Test: `api/tests/extract-document.test.ts`

**Interfaces:**
- Produces: `POST /api/extract/document` body `{ name: string; data: string }` → `200 { success: true, data: { text, title, pages } }` | `401` | `402 { code: 'subscription_required' }` | `413 { code: 'too_large' }` | `415 { code: 'not_pdf' }` | `422 { code: 'no_text' }`.

- [ ] **Step 1: Write the failing tests** (pattern from `api/tests/transcribe-entitlement.test.ts` + `call` helper)

```ts
it('401 without a token', async () => { expect((await call('extract/document', { body: pdfBody() })).status).toBe(401); });
it('402 for a free user', async () => { asFreeUser(); expect((await call('extract/document', authed(pdfBody()))).status).toBe(402); });
it('413 over 3 MB', async () => { asPro(); expect((await call('extract/document', authed({ name: 'a.pdf', data: big(3 * 1024 * 1024 + 1) }))).body.code).toBe('too_large'); });
it('415 for a non-PDF', async () => { asPro(); expect((await call('extract/document', authed({ name: 'a.pdf', data: b64('hello') }))).body.code).toBe('not_pdf'); });
it('reads the fixture PDF', async () => {
  asPro();
  const r = await call('extract/document', authed(pdfBody()));
  expect(r.status).toBe(200); expect(r.body.data.pages).toBe(2); expect(r.body.data.text).toMatch(/Mitochondria/);
});
```

- [ ] **Step 2: Run** `cd api && npx vitest run tests/extract-document.test.ts` — Expected: FAIL (404/400).
- [ ] **Step 3: Implement** — `npm install unpdf`; `pdfText` uses `extractText(await getDocumentProxy(bytes), { mergePages: true })`; cap 60,000 chars; empty after trim → 422. Auth + entitlement exactly as `handleAI` (`supabase.auth.getUser`, `isEntitledWithRoleAccess`). Title = `name` without extension.
- [ ] **Step 4: Run** the test and `npx vitest run && npx tsc --noEmit` in `api/` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): extract text from an uploaded PDF`

### Task 6: API — read text from photos

**Files:**
- Modify: `api/index.ts` (`handleExtract` action `image`), `api/_lib/extract.ts` (`imageText`)
- Test: `api/tests/extract-image.test.ts`

**Interfaces:**
- Produces: `POST /api/extract/image` body `{ images: string[] }` → `200 { success: true, data: { text } }` | `400 { code: 'bad_request' }` (0 or > 5 images) | `401` | `402` | `413 { code: 'too_large' }` (any image > 1.5 MB) | `422 { code: 'no_text' }` | `503 { code: 'unavailable' }` (no `GEMINI_API_KEY`).

- [ ] **Step 1: Write the failing tests** (stub global `fetch` for the Gemini call)

```ts
it('sends every page as a data URI to the Gemini vision model', async () => {
  asPro(); vi.stubEnv('GEMINI_API_KEY', 'g');
  const fetch = stubGemini('Photosynthesis makes glucose.');
  const r = await call('extract/image', authed({ images: [jpeg(), jpeg()] }));
  expect(r.body.data.text).toBe('Photosynthesis makes glucose.');
  const sent = JSON.parse(fetch.mock.calls[0][1].body);
  expect(sent.model).toBe('gemini-2.0-flash');
  expect(sent.messages[0].content.filter((p: any) => p.type === 'image_url')).toHaveLength(2);
  expect(sent.messages[0].content[0].text).toMatch(/handwriting/);
});
it('uses GEMINI_VISION_MODEL when set', async () => { /* model override */ });
it('400 for 0 or 6 images', async () => { /* bad_request */ });
it('503 without a Gemini key', async () => { /* unavailable, fetch not called */ });
it('422 when the model finds no text', async () => { /* reply '' or 'NO_TEXT' → no_text */ });
```

- [ ] **Step 2: Run** `npx vitest run tests/extract-image.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement `imageText(images: string[]): Promise<string>`** — POST to the Gemini provider URL from `_providers.ts` with `Authorization: Bearer GEMINI_API_KEY`, one user message: a text part (instruction: transcribe all text in order, including handwriting and diagram labels; plain text only; reply `NO_TEXT` if none) then one `{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,…' } }` per page.
- [ ] **Step 4: Run** the full api suite + `tsc` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): read notes and textbook pages from photos`

### Task 7: Mobile — dependencies, permissions, `ask` and source readers

**Files:**
- Modify: `mobile/package.json` (+ lockfile), `mobile/app.config.ts` (`ios.infoPlist.NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` = "BonaMind reads your notes to make cards."), `mobile/src/__tests__/appConfig.test.ts`
- Create: `mobile/src/create/api.ts` (`authedPost`), `mobile/src/create/ask.ts`, `mobile/src/create/sources.ts`, `mobile/src/create/copy.ts`
- Test: `mobile/src/create/__tests__/ask.test.ts`, `mobile/src/create/__tests__/sources.test.ts`

**Interfaces:**
- Consumes: Task 3 `AskFn`, `CreateError`, `CourseSource`; `env.apiBaseUrl`; `getSupabase().auth.getSession()`.
- Produces: `authedPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T>` (45 s timeout; throws `CreateError` by status: 401, 5xx and timeout → `busy`; 402 → `subscription`; 413 → `too_large`; 415/422 → `unreadable`; 429 → `rate_limited`; a thrown fetch → `offline`); `ask: AskFn`; `readTopic(topic: string): CourseSource`; `readLink(url: string): Promise<CourseSource>`; `isYouTube(url: string): boolean`; `pickPdf(): Promise<PickedPdf | null>` with `PickedPdf = { name: string; size: number; uri: string }`; `readPdf(file: PickedPdf): Promise<CourseSource>`; `pickPhotos(from: 'camera' | 'library'): Promise<string[]>` (local URIs); `readPhotos(uris: string[]): Promise<CourseSource>`; `CREATE_COPY` (all §5 strings, keyed by `CreateErrorKind` plus `offlineButton`, `proButton`, `partial`, `pasteInstead`).

- [ ] **Step 1: Install** `cd mobile && npm install expo-document-picker@<v> expo-image-picker@<v> expo-image-manipulator@<v> expo-file-system@<v> expo-clipboard@<v>` with the versions SDK 57 expects (read them from `npx expo install --check` / the Expo SDK 57 version map), then `npx expo install --check` → "Dependencies are up to date".
- [ ] **Step 2: Write the failing tests**

```ts
it('maps proxy statuses to create errors', async () => {
  for (const [status, kind] of [[402, 'subscription'], [429, 'rate_limited'], [503, 'busy']] as const) {
    mockFetch(status); await expect(ask('p')).rejects.toMatchObject({ kind });
  }
});
it('sends the prompt with temperature 0.4 and max_tokens 4096 and returns the reply text', async () => { /* body shape, choices[0].message.content */ });
it('times out after 45s as busy', async () => { /* fake timers */ });
it('routes YouTube links to the transcript endpoint', async () => {
  await readLink('https://youtu.be/abc'); expect(lastPath()).toBe('/api/fetch-youtube-transcript');
  await readLink('https://example.com/a'); expect(lastPath()).toBe('/api/fetch-url');
});
it('refuses a PDF over 3 MB before uploading', async () => {
  await expect(readPdf({ name: 'a.pdf', size: 3 * 1024 * 1024 + 1, uri: 'file://a' })).rejects.toMatchObject({ kind: 'too_large' });
  expect(fetchMock).not.toHaveBeenCalled();
});
it('resizes photos to a 1600px JPEG', async () => {
  await readPhotos(['file://heic-1']);
  expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith('file://heic-1', [{ resize: { width: 1600 } }], { compress: 0.7, format: 'jpeg', base64: true });
});
it('turns a link fetch into a text source titled by the page', async () => { /* { kind:'text', title, label: host } */ });
it('requires an http(s) URL', async () => { await expect(readLink('notaurl')).rejects.toMatchObject({ kind: 'unreadable' }); });
```

Resize uses the longer side: pass `{ width: 1600 }` for landscape, `{ height: 1600 }` for portrait, using the picker's reported dimensions; the test fixture is landscape.

- [ ] **Step 3: Run** `npx jest src/create` — Expected: FAIL.
- [ ] **Step 4: Implement** the four files and the config strings; app config test asserts both Info.plist strings.
- [ ] **Step 5: Run** `npx jest src/create src/__tests__/appConfig.test.ts && npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(mobile): source readers and the AI call for course creation`

### Task 8: Mobile — the build store

**Files:**
- Create: `mobile/src/create/store.ts`
- Test: `mobile/src/create/__tests__/store.test.ts`

**Interfaces:**
- Consumes: Task 3 `buildCourse`, `CourseDraft`, `BuildProgress`; Task 4 `createCourse`; Task 7 `ask`; `getSupabase()`; `getData().getFsrsProfile`; NetInfo; `queryClient` passed in.
- Produces: `useCreateStore` (zustand) with state `{ phase: 'input' | 'building' | 'waiting' | 'review' | 'saving' | 'ready' | 'error'; progress: BuildProgress | null; draft: CourseDraft | null; error: CreateErrorKind | null; savedDeckId: string | null }` and actions `start(source: () => Promise<CourseSource>, size: CourseSize): void` (no-op unless phase is `input` or `error`), `removeCard(i: number): void`, `restoreCard(i: number, card: DraftCard): void`, `editCard(i: number, card: DraftCard): void`, `rename(title: string): void`, `save(userId: string, onSaved: (deckId: string) => void): Promise<void>`, `reset(): void`. `waiting` = paused for a connection; resumes the same build when NetInfo reports online.

- [ ] **Step 1: Write the failing tests**

```ts
it('ignores a second start while building', async () => { start(src, 'quick'); start(src, 'quick'); await settle(); expect(buildCourse).toHaveBeenCalledTimes(1); });
it('keeps building after the screen unmounts', async () => { /* render a component using the store, unmount, resolve build → phase 'review', draft set */ });
it('pauses for a connection and resumes without losing cards', async () => { /* buildCourse rejects CreateError offline with partial → phase 'waiting'; NetInfo online → buildCourse called again with resume: partial and the same source → 'review' */ });
it('shows reading while the source is fetched', async () => { /* source() pending → progress.step 'reading' */ });
it('remove, restore, edit and rename change the draft', () => { /* draft mutations */ });
it('save success → ready with the new deck id', async () => { /* createCourse resolves → phase 'ready', savedDeckId */ });
it('save failure keeps the draft and returns to review with an error', async () => { /* phase 'review', error 'busy', draft intact */ });
it('a 402 ends in error subscription', async () => { /* phase 'error', error 'subscription' */ });
```

- [ ] **Step 2: Run** `npx jest src/create/__tests__/store.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — `buildCourse` and `createCourse` are module-level imports (mocked in tests). The store sets `progress = { step: 'reading', cardsSoFar: 0, target }` before awaiting the source reader and keeps the resolved `CourseSource`. On `CreateError('offline')` it stores `error.partial`, enters `waiting`, and on reconnect calls `buildCourse({ …, resume: partial })`, so finished pieces are neither re-read nor re-generated.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): an app-wide course build that survives navigation`

### Task 9: Mobile — the New course screen

**Files:**
- Create: `mobile/src/design/components/SegmentedControl.tsx`, `mobile/src/create/CreateScreen.tsx`, `mobile/src/app/create.tsx`
- Modify: `mobile/src/app/_layout.tsx` (register `create` inside the signed-in `Stack.Protected`, `presentation: 'modal'`, `contentStyle: { backgroundColor: colors.night }`)
- Test: `mobile/src/create/__tests__/createScreen.test.tsx`, `mobile/src/design/components/__tests__/segmented.test.tsx`

**Interfaces:**
- Consumes: Task 7 readers and `CREATE_COPY`; Task 8 store; `useSync().online`.
- Produces: `SegmentedControl<T extends string>({ options: { value: T; label: string }[]; value: T; onChange(v: T): void })` (accessibilityRole `tablist`, each option `tab` with `selected` state); `CreateScreen` renders the building/review/ready views from Tasks 10–11 by `phase`.

- [ ] **Step 1: Write the failing tests**

```ts
it('switches the input when a source tile is chosen', async () => { /* Topic → text field; Link → URL field; PDF → "Choose a PDF"; Photo → "Take photo" and "Choose photos" */ });
it('prefills only http(s) URLs from the clipboard', async () => {
  clipboard('just some notes'); await chooseLink(); expect(urlField().props.value).toBe('');
  clipboard('https://example.com/a'); await chooseLink(); expect(urlField().props.value).toBe('https://example.com/a');
});
it('defaults to Standard and changes size', async () => { /* tab selected states */ });
it('starts a build with the chosen source and size', async () => { /* start called with size 'deep' */ });
it('says to connect when offline and does not start', async () => { /* button label CREATE_COPY.offlineButton; start not called */ });
it('shows the Pro label after a subscription error', async () => { /* store error 'subscription' → CREATE_COPY.proButton */ });
it('caps photos at 5 and removes a page on its close button', async () => { /* … */ });
```

- [ ] **Step 2: Run** `npx jest src/create/__tests__/createScreen.test.tsx src/design/components/__tests__/segmented.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** — tiles per spec §3 (SF Symbols `sparkles`, `link`, `doc.text`, `camera`; accents violet, cyan, amber `colors.hard`, pink), input area uses `LinearTransition` layout animation, selected tile lifts with a spring; `AuroraBackground intensity={0.4}` behind, grabber like `LinneaSheet`.
- [ ] **Step 4: Run** — Expected: PASS; `npx tsc --noEmit`, `npx eslint src` — 0 errors.
- [ ] **Step 5: Commit** `feat(mobile): New course sheet with four sources and a size picker`

### Task 10: Mobile — building and ready views

**Files:**
- Create: `mobile/src/create/BuildingView.tsx`, `mobile/src/create/ReadyView.tsx`
- Test: `mobile/src/create/__tests__/buildingReady.test.tsx`

**Interfaces:**
- Consumes: store `progress`, `draft`, `savedDeckId`; `LoadingScreen`'s prism (extract `Prism` as an export of `LoadingScreen.tsx` if not exported); `Confetti`; `haptic`.
- Produces: `BuildingView()` and `ReadyView({ onStudy(): void; onDone(): void })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('ticks steps and shows "Writing card N of M"', async () => { /* progress writing 7/20 → text 'Writing card 7 of 20', earlier steps checked */ });
it('shows waiting copy while paused for a connection', async () => { /* phase waiting */ });
it('stacks the latest card as it lands', async () => { /* progress.latest.front visible */ });
it('ready shows the count and title and routes Study now', async () => { /* 'Course ready', '19 cards in Cells', onStudy called */ });
it('skips confetti under Reduce Motion', async () => { /* Confetti not rendered */ });
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — step haptic `selection` on each tick, `success` on ready; Study now → `router.replace('/study/' + savedDeckId)` after the modal closes (`router.dismiss()` then push).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): live building view and the course-ready moment`

### Task 11: Mobile — review deck and card editor

**Files:**
- Create: `mobile/src/create/ReviewDeck.tsx`, `mobile/src/create/EditCardSheet.tsx`
- Test: `mobile/src/create/__tests__/review.test.tsx`

**Interfaces:**
- Consumes: store draft actions; `CardStack` styles (export `cardStyles` from `CardStack.tsx`); gesture testing via `react-native-gesture-handler/jest-utils` (`withTestId('review-pan')`).
- Produces: `ReviewDeck()`; `EditCardSheet({ card: DraftCard; onSave(c: DraftCard): void; onCancel(): void })`.

- [ ] **Step 1: Write the failing tests**

```ts
it('swiping left removes a card and offers Undo for 4 s', async () => { /* removeCard called; Undo visible; after 4000ms gone; Undo → restoreCard */ });
it('swiping right keeps it and shows the next', async () => { /* index advances, draft unchanged */ });
it('long-press opens the editor and saves edits', async () => { /* editCard called with new text */ });
it('renames the course from the title', async () => { /* rename called */ });
it('Keep all and Save course call save', async () => { /* save called with userId */ });
it('shows the partial note when pieces were skipped or truncated', async () => { /* CREATE_COPY.partial */ });
it('shows the save error with Try saving again', async () => { /* error after failed save */ });
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — swipe thresholds reuse `SWIPE_DISTANCE` / `SWIPE_VELOCITY` from `CardStack.tsx`; text faces use the same overflow-only scrolling as `FaceBody` (export it) so swipes aren't captured.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): review generated cards before saving`

### Task 12: Mobile — entry points, refresh and wrap-up

**Files:**
- Modify: `mobile/src/courses/CoursesScreen.tsx` (header glass **+** via `Stack.Screen options.headerRight`, `router.push('/create')`; new deck highlighted once), `mobile/src/today/TodayScreen.tsx` (Add course tile when `decks.length === 0`), `mobile/src/create/store.ts` (invalidate `['decks']` and `['cards']` after save), `HANDOFF.md`, `README.md` (`mobile/` section: creation needs the two new endpoints deployed)
- Test: `mobile/src/courses/__tests__/courses.test.tsx`, `mobile/src/today/__tests__/today.test.tsx`

**Interfaces:**
- Consumes: Task 8 `savedDeckId`; route `/create`.

- [ ] **Step 1: Write the failing tests** — `+` is a button labelled "New course" that pushes `/create`; Today with no decks shows "Add course" that pushes `/create`; after save the store calls `invalidateQueries` for `decks` and `cards`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement**, then update `HANDOFF.md` (status row for Part 2, the new endpoints and `GEMINI_VISION_MODEL`, owner items: deploy, set `GEMINI_API_KEY` if missing, device check) and the README.
- [ ] **Step 4: Verify everything** — `packages/core`: `npx vitest run && npx tsc --noEmit`; `api`: `npx vitest run && npx tsc --noEmit`; `mobile`: `npx jest && npx tsc --noEmit && npx eslint src` (0 errors) and `npx expo install --check` ("Dependencies are up to date"); website: `cd auramind-gemini && npm run type-check`.
- [ ] **Step 5: Commit** `feat(mobile): start a course from Courses and Today`
- [ ] **Step 6: Device check (owner, Expo Go)** — once the API is deployed (PR merged, or a Vercel preview pointed at by `EXPO_PUBLIC_API_BASE_URL`), make one course from each source; confirm each appears on bonamind.app.
