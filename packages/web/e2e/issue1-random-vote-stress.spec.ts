import { expect, test, chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_NAME = 'issue1-random-vote-stress';
const REPORT_DATE = process.env.FGSH_ISSUE1_REPORT_DATE || '2026-06-06-issue1-random-vote-stress';
const RUN_COUNT = Number.parseInt(process.env.FGSH_ISSUE1_RANDOM_RUNS || '20', 10);
const MIN_PLAYERS = Number.parseInt(process.env.FGSH_ISSUE1_MIN_PLAYERS || '6', 10);
const MAX_PLAYERS = Number.parseInt(process.env.FGSH_ISSUE1_MAX_PLAYERS || '10', 10);
const RANDOM_SEED = Number.parseInt(process.env.FGSH_ISSUE1_RANDOM_SEED || `${Date.now() % 2_147_483_647}`, 10);
const ROUNDS_PER_ROOM = Number.parseInt(process.env.FGSH_ISSUE1_ROUNDS_PER_ROOM || '1', 10);
const BROWSER_ENGINE = (process.env.FGSH_ISSUE1_BROWSER || 'chromium').toLowerCase();
const MOBILE_WIDTH = Number.parseInt(process.env.FGSH_ISSUE1_MOBILE_WIDTH || '390', 10);
const MOBILE_HEIGHT = Number.parseInt(process.env.FGSH_ISSUE1_MOBILE_HEIGHT || '844', 10);
const MOBILE_DPR = Number.parseFloat(process.env.FGSH_ISSUE1_MOBILE_DPR || '1');
const SESSION_KEY = 'fibbage_game_session';
const MOBILE_VIEWPORT = { width: MOBILE_WIDTH, height: MOBILE_HEIGHT };
const TV_VIEWPORT = { width: 1440, height: 900 };

type CaseStatus = 'pass' | 'fail';
type VoteMode = 'holdback' | 'simultaneous' | 'staggered' | 'change-before-confirm' | 'reload-after-save' | 'late-burst';

interface DiagnosticRow {
  run: number;
  source: string;
  type: 'console' | 'pageerror' | 'requestfailed' | 'http';
  message: string;
  url?: string;
  status?: number;
}

interface RunResult {
  run: number;
  status: CaseStatus;
  durationMs: number;
  mode: string;
  playerCount: number;
  gameCode?: string;
  roundId?: string;
  details: string;
}

interface StressReport {
  startedAt: string;
  completedAt?: string;
  targetUrl: string;
  seed: number;
  runCount: number;
  playerRange: string;
  roundsPerRoom: number;
  browserEngine: string;
  mobileViewport: string;
  status: CaseStatus;
  runs: RunResult[];
  diagnostics: DiagnosticRow[];
  screenshots: { label: string; relativePath: string }[];
  blockers: string[];
}

interface StoredGameSession {
  gameId: string;
  gameCode?: string;
  playerId: string | null;
  playerToken?: string;
}

interface PlayerSession {
  name: string;
  playerId: string;
  context: BrowserContext;
  page: Page;
}

interface RoomSession {
  code: string;
  gameId: string;
  hostContext: BrowserContext;
  tvPage: Page;
  players: PlayerSession[];
}

interface SupabaseConfig {
  url: string;
  anonKey: string;
  storageKey: string;
}

interface GameRow {
  id: string;
  code: string;
}

interface RoundRow {
  id: string;
  game_id: string;
  round_number: number;
  status: string;
  timer_starts_at: string | null;
  timer_duration: number;
}

interface AnswerRow {
  id: string;
  round_id: string;
  player_id: string | null;
  answer_text: string;
  is_correct: boolean;
}

interface VoteRow {
  id: string;
  round_id: string;
  voter_id: string;
  answer_id: string;
  points_earned: number;
}

interface VoteAttempt {
  player: PlayerSession;
  target: AnswerRow;
  targetText: string;
  selectedUiAfterConfirm: boolean;
  selectedTextsAfterConfirm: string[];
  savedMessageAfterConfirm: boolean;
  optionCountAfterConfirm: number;
  urlAfterConfirm: string;
  tapProbe: TapProbe;
}

interface TapProbe {
  targetText: string;
  buttonRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  tapPoint: {
    x: number;
    y: number;
  };
  topElement: {
    tagName: string;
    className: string;
    text: string;
  } | null;
  targetWasTopmost: boolean;
}

const testFilePath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(testFilePath), '..');
const repoRoot = path.resolve(webRoot, '../..');
const reportDir = path.join(repoRoot, 'qa-reports', `${TEST_NAME}-${REPORT_DATE}`);
const screenshotDir = path.join(reportDir, 'screenshots');
const reportPath = path.join(reportDir, `${TEST_NAME}.md`);
const localEnvPath = path.join(webRoot, '.env.local');
const browserExecutableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((candidate): candidate is string => !!candidate);

function createInitialReport(): StressReport {
  return {
    startedAt: new Date().toISOString(),
    targetUrl: process.env.FGSH_TEST_BASE_URL || '(missing)',
    seed: RANDOM_SEED,
    runCount: RUN_COUNT,
    playerRange: `${MIN_PLAYERS}-${MAX_PLAYERS}`,
    roundsPerRoom: ROUNDS_PER_ROOM,
    browserEngine: BROWSER_ENGINE,
    mobileViewport: `${MOBILE_WIDTH}x${MOBILE_HEIGHT}@${MOBILE_DPR}`,
    status: 'pass',
    runs: [],
    diagnostics: [],
    screenshots: [],
    blockers: [],
  };
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

function routeUrl(baseUrl: string, route: string): string {
  return `${baseUrl}${route}`;
}

function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolveBrowserExecutable(): string | undefined {
  return browserExecutableCandidates.find((candidate) => fsSync.existsSync(candidate));
}

async function launchStressBrowser(): Promise<Browser> {
  if (BROWSER_ENGINE === 'webkit') {
    return await webkit.launch();
  }

  if (BROWSER_ENGINE === 'firefox') {
    return await firefox.launch();
  }

  if (BROWSER_ENGINE !== 'chromium') {
    throw new Error(`Unsupported FGSH_ISSUE1_BROWSER=${BROWSER_ENGINE}. Expected chromium, webkit, or firefox.`);
  }

  const executablePath = resolveBrowserExecutable();
  return await chromium.launch(executablePath ? { executablePath } : undefined);
}

function readLocalEnvValue(key: string): string | undefined {
  if (!fsSync.existsSync(localEnvPath)) return undefined;

  const contents = fsSync.readFileSync(localEnvPath, 'utf8');
  const line = contents
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));

  if (!line) return undefined;
  return line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
}

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.FGSH_SUPABASE_URL || readLocalEnvValue('VITE_SUPABASE_URL');
  const anonKey = process.env.FGSH_SUPABASE_ANON_KEY || readLocalEnvValue('VITE_SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error('Missing Supabase config. Set FGSH_SUPABASE_URL/FGSH_SUPABASE_ANON_KEY or packages/web/.env.local.');
  }

  const normalizedUrl = url.replace(/\/+$/, '');
  const projectRef = new URL(normalizedUrl).hostname.split('.')[0];
  return {
    url: normalizedUrl,
    anonKey,
    storageKey: `sb-${projectRef}-auth-token`,
  };
}

function makeRng(seed: number) {
  let state = seed % 2_147_483_647;
  if (state <= 0) state += 2_147_483_646;

  return {
    next() {
      state = (state * 16_807) % 2_147_483_647;
      return (state - 1) / 2_147_483_646;
    },
    int(min: number, max: number) {
      return min + Math.floor(this.next() * (max - min + 1));
    },
    pick<T>(items: T[]): T {
      return items[this.int(0, items.length - 1)];
    },
  };
}

async function restSelect<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const config = getSupabaseConfig();
  const url = new URL(`${config.url}/rest/v1/${table}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Supabase REST ${table} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  return await response.json() as T[];
}

async function authenticateHostContext(context: BrowserContext, email: string, password: string) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Host Supabase Auth login failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const session = await response.json() as Record<string, unknown>;
  const expiresIn = typeof session.expires_in === 'number' ? session.expires_in : 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  await context.addInitScript(
    ({ storageKey, value }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    },
    { storageKey: config.storageKey, value: { ...session, expires_at: expiresAt } }
  );
}

async function ensureReportDirs() {
  await fs.mkdir(screenshotDir, { recursive: true });
}

function isRelevantDiagnostic(item: DiagnosticRow): boolean {
  if (
    item.message.includes('net::ERR_ABORTED') &&
    /\.(woff2?|wav|mp3|ogg|png|jpe?g|webp|svg)(?:\?|$)/i.test(item.url || '')
  ) {
    return false;
  }

  if (/could not autoplay|play\(\) request was interrupted|WebAudio renderer/i.test(item.message)) {
    return false;
  }

  return item.type === 'pageerror' ||
    item.type === 'requestfailed' ||
    (item.type === 'console' && /error|exception|failed/i.test(item.message)) ||
    (item.type === 'http' && (item.status || 0) >= 500);
}

async function writeReport(report: StressReport) {
  await ensureReportDirs();
  const relevantDiagnostics = report.diagnostics.filter(isRelevantDiagnostic);
  const completedAt = report.completedAt || new Date().toISOString();

  const lines = [
    '# Issue 1 Random Vote Stress Report',
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Target URL: ${report.targetUrl}`,
    `- Started: ${report.startedAt}`,
    `- Completed: ${completedAt}`,
    `- Random seed: ${report.seed}`,
    `- Runs requested: ${report.runCount}`,
    `- Player range: ${report.playerRange}`,
    `- Rounds per room: ${report.roundsPerRoom}`,
    `- Browser engine: ${report.browserEngine}`,
    `- Mobile viewport: ${report.mobileViewport}`,
    '- Credentials: supplied through environment variables and intentionally not logged.',
    '',
    '## Runs',
    '',
    '| Run | Status | Players | Mode | Duration ms | Game | Round | Details |',
    '| ---: | --- | ---: | --- | ---: | --- | --- | --- |',
    ...report.runs.map((item) =>
      `| ${item.run} | ${item.status.toUpperCase()} | ${item.playerCount} | ${item.mode} | ${item.durationMs} | ${item.gameCode || ''} | ${item.roundId || ''} | ${markdownEscape(item.details)} |`
    ),
    '',
    '## Diagnostics',
    '',
    `- Console/page/request records captured: ${report.diagnostics.length}`,
    `- Relevant error records: ${relevantDiagnostics.length}`,
    '',
    relevantDiagnostics.length > 0
      ? '| Run | Source | Type | Status | URL | Message |'
      : '_No relevant framework/runtime errors were recorded._',
    relevantDiagnostics.length > 0 ? '| ---: | --- | --- | ---: | --- | --- |' : '',
    ...relevantDiagnostics.slice(0, 60).map((diagnostic) =>
      `| ${diagnostic.run} | ${markdownEscape(diagnostic.source)} | ${diagnostic.type} | ${diagnostic.status || ''} | ${markdownEscape(diagnostic.url || '')} | ${markdownEscape(diagnostic.message.slice(0, 500))} |`
    ),
    relevantDiagnostics.length > 60 ? `\n_Additional diagnostics omitted: ${relevantDiagnostics.length - 60}_` : '',
    '',
    '## Blockers / Failures',
    '',
    report.blockers.length > 0
      ? report.blockers.map((blocker) => `- ${markdownEscape(blocker)}`).join('\n')
      : '_No blockers recorded._',
    '',
    '## Screenshots',
    '',
    report.screenshots.length > 0
      ? report.screenshots.map((screenshot) => `${screenshot.label}\n\n![${screenshot.label}](${screenshot.relativePath})`).join('\n\n')
      : '_No screenshots were captured._',
    '',
  ].filter((line) => line !== undefined).join('\n');

  await fs.writeFile(reportPath, lines, 'utf8');
}

function addDiagnostics(page: Page, source: string, run: number, report: StressReport) {
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    report.diagnostics.push({
      run,
      source,
      type: 'console',
      message: `[${message.type()}] ${message.text()}`,
      url: page.url(),
    });
  });

  page.on('pageerror', (error) => {
    report.diagnostics.push({
      run,
      source,
      type: 'pageerror',
      message: error.message,
      url: page.url(),
    });
  });

  page.on('requestfailed', (request) => {
    report.diagnostics.push({
      run,
      source,
      type: 'requestfailed',
      message: request.failure()?.errorText || 'Request failed',
      url: request.url(),
    });
  });

  page.on('response', (response) => {
    if (response.status() < 500) return;
    report.diagnostics.push({
      run,
      source,
      type: 'http',
      status: response.status(),
      message: response.statusText(),
      url: response.url(),
    });
  });
}

async function captureScreenshot(report: StressReport, page: Page, label: string, fileName: string) {
  await ensureReportDirs();
  const relativePath = path.posix.join('screenshots', fileName);
  await page.screenshot({
    path: path.join(screenshotDir, fileName),
    fullPage: false,
  });
  report.screenshots.push({ label, relativePath });
}

async function pageText(page: Page): Promise<string> {
  return page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
}

async function extractGameCode(page: Page): Promise<string | null> {
  const text = await pageText(page);
  const matches = text.match(/\b[A-Z0-9]{6}\b/g) || [];
  return matches[0] || null;
}

async function closeStaleAuthModalIfPresent(page: Page) {
  const emailInput = page.locator('#email');
  const isLoginVisible = await emailInput.isVisible({ timeout: 2_000 }).catch(() => false);
  if (!isLoginVisible) return;

  const closeButton = page.locator('.fixed.inset-0 button').first();
  if (await closeButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await closeButton.click({ force: true });
    await page.locator('#email').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  }
}

async function storedGameSession(page: Page): Promise<StoredGameSession | null> {
  return await page.evaluate((key) => {
    const raw = window.sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SESSION_KEY) as StoredGameSession | null;
}

async function visibleVoteOptionCount(page: Page): Promise<number> {
  return await page.locator('button.w-full.p-3.rounded-xl.text-right').count();
}

async function hasSelectedVoteButton(page: Page): Promise<boolean> {
  return (await page.locator('button.bg-cyan-500').count().catch(() => 0)) > 0;
}

async function selectedVoteTexts(page: Page): Promise<string[]> {
  return await page.locator('button.bg-cyan-500').evaluateAll((buttons) =>
    buttons.map((button) => (button.textContent || '').replace(/\s+/g, ' ').trim())
  ).catch(() => []);
}

async function hasSavedVoteMessage(page: Page): Promise<boolean> {
  const text = await pageText(page);
  return /تم حفظ التصويت|vote saved|saved/i.test(text);
}

async function probeTapTarget(page: Page, targetText: string): Promise<TapProbe> {
  const option = page
    .locator('button.w-full.p-3.rounded-xl.text-right')
    .filter({ hasText: targetText })
    .first();
  await option.scrollIntoViewIfNeeded();

  return await option.evaluate((button, text) => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    const targetWasTopmost = top === button || !!top?.closest('button.w-full.p-3.rounded-xl.text-right')?.isSameNode(button);

    return {
      targetText: text,
      buttonRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      tapPoint: { x, y },
      topElement: top
        ? {
            tagName: top.tagName,
            className: typeof (top as HTMLElement).className === 'string' ? (top as HTMLElement).className : '',
            text: (top.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140),
          }
        : null,
      targetWasTopmost,
    };
  }, targetText);
}

async function clickConfirmationIfPresent(page: Page) {
  const dialog = page.locator('.fixed.inset-0').last();
  const confirmButton = dialog.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500');

  if (await confirmButton.isVisible({ timeout: 2_500 }).catch(() => false)) {
    try {
      await confirmButton.click({ timeout: 5_000, force: true });
    } catch (error) {
      const stillVisible = await confirmButton.isVisible({ timeout: 500 }).catch(() => false);
      if (stillVisible) throw error;
    }
  }
}

async function clickEditIfPresent(page: Page): Promise<boolean> {
  const dialog = page.locator('.fixed.inset-0').last();
  const confirmButton = dialog.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500');
  if (!await confirmButton.isVisible({ timeout: 1_000 }).catch(() => false)) return false;

  const editButton = dialog.locator('button').filter({ hasNot: page.locator('.bg-gradient-to-r') }).first();
  if (!await editButton.isVisible({ timeout: 1_000 }).catch(() => false)) return false;
  await editButton.click({ force: true });
  return true;
}

async function pollUntil<T>(
  getter: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs: number,
  label: string,
  intervalMs = 500
): Promise<T> {
  const startedAt = Date.now();
  let latest: T | undefined;

  while (Date.now() - startedAt < timeoutMs) {
    latest = await getter();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`${label} timed out after ${timeoutMs}ms. Latest value: ${JSON.stringify(latest)}`);
}

async function waitForVisibleAnswerInput(page: Page, timeout = 60_000) {
  await page.locator('input[type="text"]').first().waitFor({ state: 'visible', timeout });
}

async function waitForAnsweringOrHandleCategorySelection(controllerPage: Page) {
  const deadline = Date.now() + 70_000;
  let latestText = '';

  while (Date.now() < deadline) {
    const input = controllerPage.locator('input[type="text"]').first();
    if (await input.isVisible().catch(() => false)) return;

    latestText = await pageText(controllerPage).catch(() => '');
    const continueButton = controllerPage
      .locator('button.bg-gradient-to-r.from-pink-500.to-purple-500')
      .last();
    const canClickContinue = await continueButton.isVisible({ timeout: 500 }).catch(() => false) &&
      await continueButton.isEnabled().catch(() => false);

    if (canClickContinue) {
      await continueButton.click();
      await waitForVisibleAnswerInput(controllerPage, 60_000);
      return;
    }

    await controllerPage.waitForTimeout(250);
  }

  throw new Error(`Controller did not reach answering/category state. Text: ${latestText.slice(0, 300)}`);
}

async function fetchGameByCode(code: string): Promise<GameRow> {
  const rows = await restSelect<GameRow>('games', {
    select: 'id,code',
    code: `eq.${code}`,
    limit: '1',
  });
  if (!rows[0]) throw new Error(`Game ${code} was not visible through REST.`);
  return rows[0];
}

async function fetchLatestRound(gameId: string): Promise<RoundRow> {
  const rows = await restSelect<RoundRow>('game_rounds', {
    select: 'id,game_id,round_number,status,timer_starts_at,timer_duration',
    game_id: `eq.${gameId}`,
    order: 'round_number.desc',
    limit: '1',
  });
  if (!rows[0]) throw new Error(`No rounds found for game ${gameId}.`);
  return rows[0];
}

async function fetchAnswers(roundId: string): Promise<AnswerRow[]> {
  return await restSelect<AnswerRow>('player_answers', {
    select: 'id,round_id,player_id,answer_text,is_correct',
    round_id: `eq.${roundId}`,
    order: 'submitted_at.asc',
  });
}

async function fetchVotes(roundId: string): Promise<VoteRow[]> {
  return await restSelect<VoteRow>('votes', {
    select: 'id,round_id,voter_id,answer_id,points_earned',
    round_id: `eq.${roundId}`,
  });
}

async function closeRoom(room: RoomSession | undefined) {
  if (!room) return;
  await Promise.allSettled([
    ...room.players.map((player) => player.context.close()),
    room.hostContext.close(),
  ]);
}

async function createRoom(
  browser: Browser,
  report: StressReport,
  baseUrl: string,
  run: number,
  playerCount: number
): Promise<RoomSession> {
  const hostContext = await browser.newContext({ viewport: TV_VIEWPORT, locale: 'ar-SA' });
  await authenticateHostContext(
    hostContext,
    process.env.FGSH_TEST_HOST_EMAIL!,
    process.env.FGSH_TEST_HOST_PASSWORD!
  );

  const tvPage = await hostContext.newPage();
  addDiagnostics(tvPage, `run ${run} TV`, run, report);
  await tvPage.goto(routeUrl(baseUrl, '/create'), { waitUntil: 'domcontentloaded' });
  await closeStaleAuthModalIfPresent(tvPage);
  await tvPage.goto(routeUrl(baseUrl, '/create'), { waitUntil: 'domcontentloaded' });
  await closeStaleAuthModalIfPresent(tvPage);

  await Promise.all([
    tvPage.waitForURL(/\/tv\/lobby(?:\?|$)/, { timeout: 45_000 }),
    tvPage.locator('.btn-gradient.btn-pink').first().click(),
  ]);

  await expect.poll(async () => extractGameCode(tvPage), { timeout: 20_000 }).toMatch(/^[A-Z0-9]{6}$/);
  const code = await extractGameCode(tvPage);
  if (!code) throw new Error('TV room code was not visible after room creation.');
  const game = await fetchGameByCode(code);

  const joinPlayer = async (playerNumber: number): Promise<PlayerSession> => {
    const name = `I1R${String(run).padStart(2, '0')} P${String(playerNumber).padStart(2, '0')}`;
    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      locale: 'ar-SA',
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: MOBILE_DPR,
    });
    const page = await context.newPage();
    addDiagnostics(page, name, run, report);

    await page.goto(routeUrl(baseUrl, `/join?code=${code}`), { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').first().fill(name);
    await Promise.all([
      page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 45_000 }),
      page.locator('.btn-gradient.btn-pink').first().click(),
    ]);

    const session = await storedGameSession(page);
    if (!session?.playerId) throw new Error(`${name} joined but no player session was saved.`);
    return { name, playerId: session.playerId, context, page };
  };

  const firstPlayer = await joinPlayer(1);
  const remainingPlayers = await Promise.all(
    Array.from({ length: playerCount - 1 }, (_, index) => joinPlayer(index + 2))
  );

  return {
    code,
    gameId: game.id,
    hostContext,
    tvPage,
    players: [firstPlayer, ...remainingPlayers],
  };
}

async function startGame(room: RoomSession) {
  const controller = room.players[0];
  await Promise.all([
    room.tvPage.waitForURL(/\/tv\/game(?:\?|$)/, { timeout: 60_000 }),
    controller.page.waitForURL(/\/game(?:\?|$)/, { timeout: 60_000 }),
    controller.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click(),
  ]);
  await waitForAnsweringOrHandleCategorySelection(controller.page);
  await Promise.all(room.players.map((player) => waitForVisibleAnswerInput(player.page)));
}

async function submitAllAnswers(room: RoomSession, run: number) {
  await Promise.all(room.players.map(async (player, index) => {
    const answer = `issue1 run ${run} unique answer ${index + 1} ${Date.now()}`;
    const input = player.page.locator('input[type="text"]').first();
    await input.fill(answer);
    await player.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click();
    await clickConfirmationIfPresent(player.page);
    await expect.poll(async () => {
      const inputVisible = await input.isVisible().catch(() => false);
      const optionCount = await visibleVoteOptionCount(player.page).catch(() => 0);
      return !inputVisible || optionCount > 1;
    }, { timeout: 30_000 }).toBe(true);
  }));

  await Promise.all(room.players.map((player) =>
    expect.poll(async () => visibleVoteOptionCount(player.page), { timeout: 20_000 }).toBeGreaterThan(1)
  ));
}

function chooseVoteTarget(player: PlayerSession, answers: AnswerRow[], rng: ReturnType<typeof makeRng>): AnswerRow {
  const candidates = answers.filter((answer) => answer.player_id !== player.playerId);
  if (candidates.length === 0) throw new Error(`${player.name} had no non-own answer candidates.`);
  return rng.pick(candidates);
}

async function clickVoteTarget(player: PlayerSession, target: AnswerRow): Promise<TapProbe> {
  const option = player.page
    .locator('button.w-full.p-3.rounded-xl.text-right')
    .filter({ hasText: target.answer_text })
    .first();
  await expect(option, `${player.name} vote option "${target.answer_text}"`).toBeVisible({ timeout: 10_000 });
  await expect(option, `${player.name} vote option enabled`).toBeEnabled({ timeout: 5_000 });
  const tapProbe = await probeTapTarget(player.page, target.answer_text);

  if (!tapProbe.targetWasTopmost) {
    throw new Error(
      `${player.name} vote option was not topmost at tap point. Target="${target.answer_text}". ` +
      `Top=${tapProbe.topElement?.tagName || 'none'} ${tapProbe.topElement?.className || ''} "${tapProbe.topElement?.text || ''}". ` +
      `Rect=${JSON.stringify(tapProbe.buttonRect)} Tap=${JSON.stringify(tapProbe.tapPoint)}`
    );
  }

  await option.tap({ timeout: 5_000 });
  return tapProbe;
}

async function votePlayer(
  player: PlayerSession,
  target: AnswerRow,
  delayMs: number,
  changeTarget?: AnswerRow
): Promise<VoteAttempt> {
  if (delayMs > 0) await player.page.waitForTimeout(delayMs);

  let tapProbe = await clickVoteTarget(player, target);
  let finalTarget = target;

  if (changeTarget) {
    const edited = await clickEditIfPresent(player.page);
    if (edited) {
      finalTarget = changeTarget;
      tapProbe = await clickVoteTarget(player, finalTarget);
    }
  }

  await clickConfirmationIfPresent(player.page);
  await expect.poll(async () => {
    const options = await visibleVoteOptionCount(player.page).catch(() => 0);
    return options === 0 || await hasSelectedVoteButton(player.page) || await hasSavedVoteMessage(player.page);
  }, { timeout: 15_000 }).toBe(true);

  return {
    player,
    target: finalTarget,
    targetText: finalTarget.answer_text,
    selectedUiAfterConfirm: await hasSelectedVoteButton(player.page),
    selectedTextsAfterConfirm: await selectedVoteTexts(player.page),
    savedMessageAfterConfirm: await hasSavedVoteMessage(player.page),
    optionCountAfterConfirm: await visibleVoteOptionCount(player.page).catch(() => 0),
    urlAfterConfirm: player.page.url(),
    tapProbe,
  };
}

function roundDeadlineMs(round: RoundRow): number {
  const startedAt = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
  return startedAt + round.timer_duration * 1000;
}

async function waitUntilBeforeDeadline(round: RoundRow, beforeMs: number) {
  const waitMs = Math.max(0, roundDeadlineMs(round) - beforeMs - Date.now());
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function summarizeVotes(votes: VoteRow[]): string {
  return votes
    .map((vote) => `${vote.voter_id.slice(0, 8)}->${vote.answer_id.slice(0, 8)}:${vote.points_earned}`)
    .join(', ');
}

async function verifyExpectedVotes(
  roundId: string,
  expectedVotes: Map<string, AnswerRow>,
  label: string
): Promise<VoteRow[]> {
  const expectedVoterIds = [...expectedVotes.keys()];
  const votes = await pollUntil(
    () => fetchVotes(roundId),
    (rows) => expectedVoterIds.every((voterId) => rows.some((vote) => vote.voter_id === voterId)),
    20_000,
    `${label} persisted votes`
  );

  const failures: string[] = [];
  for (const voterId of expectedVoterIds) {
    const voterVotes = votes.filter((vote) => vote.voter_id === voterId);
    const expectedAnswer = expectedVotes.get(voterId)!;

    if (voterVotes.length === 0) {
      failures.push(`missing_persisted_vote voter=${voterId} expected_answer=${expectedAnswer.id}`);
      continue;
    }

    if (voterVotes.length > 1) {
      failures.push(`duplicate_vote_rows voter=${voterId} rows=${voterVotes.map((vote) => vote.id).join(',')}`);
    }

    if (voterVotes[0].answer_id !== expectedAnswer.id) {
      failures.push(`vote_answer_mismatch voter=${voterId} expected=${expectedAnswer.id} actual=${voterVotes[0].answer_id}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`${label}: ${failures.join(' | ')}. Persisted: ${summarizeVotes(votes)}`);
  }

  return votes;
}

async function assertSavedUiWhileVoting(room: RoomSession, attempts: VoteAttempt[], label: string) {
  const latestRound = await fetchLatestRound(room.gameId);
  if (latestRound.status !== 'voting') return;

  const failures = attempts.flatMap((attempt) => {
    if (attempt.optionCountAfterConfirm === 0) return [];

    if (!attempt.selectedUiAfterConfirm) {
      return [
        `${attempt.player.name} (${attempt.player.playerId}) selected highlight missing for "${attempt.targetText}" ` +
        `savedMessage=${attempt.savedMessageAfterConfirm} url=${attempt.urlAfterConfirm}`,
      ];
    }

    const expected = normalizeText(attempt.targetText);
    const selectedMatch = attempt.selectedTextsAfterConfirm.some((text) => normalizeText(text).includes(expected));
    if (!selectedMatch) {
      return [
        `${attempt.player.name} (${attempt.player.playerId}) selected highlight mismatch for "${attempt.targetText}". ` +
        `Selected=[${attempt.selectedTextsAfterConfirm.join(' || ')}]`,
      ];
    }

    return [];
  });

  if (failures.length > 0) {
    throw new Error(`${label}: vote_render_state_mismatch while round still voting: ${failures.join(' | ')}`);
  }
}

async function advanceToNextRound(room: RoomSession) {
  const controller = room.players[0];
  const nextButton = controller.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first();
  await expect.poll(async () => nextButton.isEnabled().catch(() => false), { timeout: 90_000 }).toBe(true);
  await nextButton.click();
  await waitForAnsweringOrHandleCategorySelection(controller.page);
  await Promise.all(room.players.map((player) => waitForVisibleAnswerInput(player.page)));
}

async function runOneStressRoom(
  browser: Browser,
  report: StressReport,
  baseUrl: string,
  run: number,
  rng: ReturnType<typeof makeRng>
): Promise<RunResult> {
  const startedAt = Date.now();
  const modes: VoteMode[] = ['holdback', 'simultaneous', 'staggered', 'change-before-confirm', 'reload-after-save', 'late-burst'];
  const mode = ROUNDS_PER_ROOM === 1 ? modes[(run - 1) % modes.length] : 'mixed';
  const playerCount = rng.int(MIN_PLAYERS, MAX_PLAYERS);
  let room: RoomSession | undefined;
  let roundId: string | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, run, playerCount);
    await startGame(room);
    const roundSummaries: string[] = [];
    const roundIds: string[] = [];

    for (let roundNumber = 1; roundNumber <= ROUNDS_PER_ROOM; roundNumber += 1) {
      const roundMode = modes[(run + roundNumber - 2) % modes.length];
      await submitAllAnswers(room, run * 100 + roundNumber);

      const votingRound = await pollUntil(
        () => fetchLatestRound(room!.gameId),
        (round) => round.status === 'voting',
        20_000,
        `run ${run} round ${roundNumber} voting round`
      );
      roundId = votingRound.id;
      roundIds.push(votingRound.id);

      const answers = await pollUntil(
        () => fetchAnswers(votingRound.id),
        (rows) => rows.length >= playerCount + 1,
        15_000,
        `run ${run} round ${roundNumber} answers`
      );

      const expectedVotes = new Map<string, AnswerRow>();
      const attempts: VoteAttempt[] = [];
      const shuffledPlayers = [...room.players].sort(() => rng.next() - 0.5);

      const runVote = async (player: PlayerSession, delayMs: number, allowChange: boolean) => {
        const target = chooseVoteTarget(player, answers, rng);
        const alternative = allowChange
          ? answers.find((answer) => answer.player_id !== player.playerId && normalizeText(answer.answer_text) !== normalizeText(target.answer_text))
          : undefined;
        const attempt = await votePlayer(player, target, delayMs, alternative);
        expectedVotes.set(player.playerId, attempt.target);
        attempts.push(attempt);
        return attempt;
      };

      if (roundMode === 'holdback') {
        const holdback = shuffledPlayers[shuffledPlayers.length - 1];
        const firstWave = shuffledPlayers.filter((player) => player !== holdback);
        await Promise.all(firstWave.map((player) => runVote(player, rng.int(0, 1_800), false)));
        await verifyExpectedVotes(votingRound.id, expectedVotes, `run ${run} round ${roundNumber} first-wave`);
        await assertSavedUiWhileVoting(room, attempts, `run ${run} round ${roundNumber} first-wave`);
        await runVote(holdback, rng.int(0, 800), false);
      } else if (roundMode === 'simultaneous') {
        await Promise.all(shuffledPlayers.map((player) => runVote(player, 0, false)));
      } else if (roundMode === 'staggered') {
        await Promise.all(shuffledPlayers.map((player) => runVote(player, rng.int(0, 6_000), false)));
      } else if (roundMode === 'change-before-confirm') {
        await Promise.all(shuffledPlayers.map((player) => runVote(player, rng.int(0, 2_500), true)));
      } else if (roundMode === 'reload-after-save') {
        const holdback = shuffledPlayers[shuffledPlayers.length - 1];
        const firstWave = shuffledPlayers.filter((player) => player !== holdback);
        await Promise.all(firstWave.map((player) => runVote(player, rng.int(0, 1_500), false)));
        await verifyExpectedVotes(votingRound.id, expectedVotes, `run ${run} round ${roundNumber} reload first-wave`);
        const reloadTargets = firstWave.filter(() => rng.next() < 0.45);
        await Promise.all(reloadTargets.map(async (player) => {
          await player.page.reload({ waitUntil: 'domcontentloaded' });
          await expect.poll(async () => await hasSelectedVoteButton(player.page) || await visibleVoteOptionCount(player.page) === 0, {
            timeout: 15_000,
          }).toBe(true);
        }));
        await assertSavedUiWhileVoting(room, attempts, `run ${run} round ${roundNumber} reload first-wave`);
        await runVote(holdback, rng.int(0, 800), false);
      } else {
        await waitUntilBeforeDeadline(votingRound, rng.int(5_000, 7_500));
        await Promise.all(shuffledPlayers.map((player) => runVote(player, rng.int(0, 1_500), false)));
      }

      const finalVotes = await verifyExpectedVotes(votingRound.id, expectedVotes, `run ${run} round ${roundNumber} final`);
      await expect.poll(async () => visibleVoteOptionCount(room!.players[0].page), { timeout: 90_000 }).toBe(0);
      await captureScreenshot(
        report,
        room.players[0].page,
        `run ${run} round ${roundNumber} completed player state`,
        `run-${String(run).padStart(2, '0')}-round-${String(roundNumber).padStart(2, '0')}-player-completed.png`
      );
      roundSummaries.push(`R${roundNumber} ${roundMode} ${finalVotes.length}/${playerCount}`);

      if (roundNumber < ROUNDS_PER_ROOM) {
        await advanceToNextRound(room);
      }
    }

    return {
      run,
      status: 'pass',
      durationMs: Date.now() - startedAt,
      mode,
      playerCount,
      gameCode: room.code,
      roundId: roundIds.join(', '),
      details: `${roundSummaries.join('; ')} vote rows persisted exactly once and matched clicked answer IDs.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (room) {
      await captureScreenshot(report, room.tvPage, `run ${run} failure TV`, `run-${String(run).padStart(2, '0')}-failure-tv.png`).catch(() => undefined);
      await Promise.allSettled(room.players.slice(0, 3).map((player, index) =>
        captureScreenshot(report, player.page, `run ${run} failure ${player.name}`, `run-${String(run).padStart(2, '0')}-failure-player-${index + 1}.png`)
      ));
    }

    return {
      run,
      status: 'fail',
      durationMs: Date.now() - startedAt,
      mode,
      playerCount,
      gameCode: room?.code,
      roundId,
      details: message,
    };
  } finally {
    await closeRoom(room);
  }
}

test.describe('issue 1 randomized live vote registration stress', () => {
  test('repeated 6+ player random vote patterns persist and show votes consistently', async () => {
    test.setTimeout(Math.max(300_000, RUN_COUNT * ROUNDS_PER_ROOM * 120_000));

    if (MIN_PLAYERS < 2 || MAX_PLAYERS > 10 || MIN_PLAYERS > MAX_PLAYERS) {
      throw new Error(`Invalid player range ${MIN_PLAYERS}-${MAX_PLAYERS}. Expected 2-10.`);
    }

    if (ROUNDS_PER_ROOM < 1 || ROUNDS_PER_ROOM > 7) {
      throw new Error(`Invalid rounds per room ${ROUNDS_PER_ROOM}. Expected 1-7.`);
    }

    const missingEnv = ['FGSH_TEST_BASE_URL', 'FGSH_TEST_HOST_EMAIL', 'FGSH_TEST_HOST_PASSWORD']
      .filter((key) => !process.env[key]);
    if (missingEnv.length > 0) {
      throw new Error(`Missing required env vars: ${missingEnv.join(', ')}`);
    }

    const report = createInitialReport();
    const baseUrl = normalizeBaseUrl(process.env.FGSH_TEST_BASE_URL!);
    report.targetUrl = baseUrl;
    const rng = makeRng(RANDOM_SEED);
    const browser = await launchStressBrowser();

    try {
      for (let run = 1; run <= RUN_COUNT; run += 1) {
        const result = await runOneStressRoom(browser, report, baseUrl, run, rng);
        report.runs.push(result);
        if (result.status === 'fail') {
          report.status = 'fail';
          report.blockers.push(`run ${result.run}: ${result.details}`);
        }
        await writeReport(report);
      }
    } finally {
      await browser.close();
      report.completedAt = new Date().toISOString();
      report.status = report.runs.some((item) => item.status === 'fail') ? 'fail' : 'pass';
      await writeReport(report);
    }

    expect(
      report.runs.filter((item) => item.status === 'fail').map((item) => `run ${item.run}: ${item.details}`).join('\n'),
      'issue 1 random vote stress failures'
    ).toBe('');
  });
});
