import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORT_DATE = process.env.FGSH_LIVE_REGRESSION_REPORT_DATE || '2026-05-27-live-regression';
const TEST_NAME = 'live-regression-battery';
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TV_VIEWPORT = { width: 1440, height: 900 };
const ANSWER_TIMEOUT_GRACE_MS = 12_000;
const VOTE_TIMEOUT_GRACE_MS = 12_000;
const SESSION_KEY = 'fibbage_game_session';

type CaseStatus = 'pass' | 'fail' | 'blocked';

interface DiagnosticRow {
  source: string;
  type: 'console' | 'pageerror' | 'requestfailed' | 'http';
  message: string;
  url?: string;
  status?: number;
}

interface CaseResult {
  label: string;
  status: CaseStatus;
  durationMs: number;
  details: string;
}

interface ScreenshotRow {
  label: string;
  relativePath: string;
}

interface LiveReport {
  startedAt: string;
  completedAt?: string;
  targetUrl: string;
  status: CaseStatus;
  cases: CaseResult[];
  diagnostics: DiagnosticRow[];
  screenshots: ScreenshotRow[];
  blockers: string[];
}

interface StoredGameSession {
  gameId: string;
  gameCode?: string;
  playerId: string | null;
  playerToken?: string;
  playerName?: string;
  isPhaseCaptain?: boolean;
  isDisplayMode?: boolean;
  joinedAt?: number;
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
  status: string;
  current_round: number;
  round_count: number;
  phase_captain_id: string | null;
  host_id: string | null;
}

interface RoundRow {
  id: string;
  game_id: string;
  round_number: number;
  status: string;
  timer_starts_at: string | null;
  timer_duration: number;
  question_id: string;
}

interface PlayerRow {
  id: string;
  game_id: string;
  user_name: string;
  score: number;
  connection_status: string;
  joined_at: string;
}

interface AnswerRow {
  id: string;
  round_id: string;
  player_id: string | null;
  answer_text: string;
  is_correct: boolean;
}

interface QuestionRow {
  id: string;
  correct_answer: string;
}

interface VoteRow {
  id: string;
  round_id: string;
  voter_id: string;
  answer_id: string;
  points_earned: number;
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

function createInitialReport(): LiveReport {
  return {
    startedAt: new Date().toISOString(),
    targetUrl: process.env.FGSH_TEST_BASE_URL || '(missing)',
    status: 'blocked',
    cases: [],
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

function resolveBrowserExecutable(): string | undefined {
  return browserExecutableCandidates.find((candidate) => fsSync.existsSync(candidate));
}

function readLocalEnvValue(key: string): string | undefined {
  if (!fsSync.existsSync(localEnvPath)) {
    return undefined;
  }

  const contents = fsSync.readFileSync(localEnvPath, 'utf8');
  const line = contents
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));

  if (!line) {
    return undefined;
  }

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

async function restRpc<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: T | null = null;

  if (text.trim().length > 0) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }

  return { ok: response.ok, status: response.status, data, text };
}

async function authenticateHostContext(context: BrowserContext, email: string, password: string) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
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
  const storedSession = { ...session, expires_at: expiresAt };

  await context.addInitScript(
    ({ storageKey, value }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    },
    { storageKey: config.storageKey, value: storedSession }
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

async function writeReport(report: LiveReport) {
  await ensureReportDirs();
  const completedAt = report.completedAt || new Date().toISOString();
  const relevantDiagnostics = report.diagnostics.filter(isRelevantDiagnostic);

  const lines = [
    '# Live Regression Battery Report',
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Target URL: ${report.targetUrl}`,
    `- Started: ${report.startedAt}`,
    `- Completed: ${completedAt}`,
    '- Credentials: supplied through environment variables and intentionally not logged.',
    '',
    '## Cases',
    '',
    '| Case | Status | Duration ms | Details |',
    '| --- | --- | ---: | --- |',
    ...report.cases.map((item) =>
      `| ${markdownEscape(item.label)} | ${item.status.toUpperCase()} | ${item.durationMs} | ${markdownEscape(item.details)} |`
    ),
    '',
    '## Diagnostics',
    '',
    `- Console/page/request records captured: ${report.diagnostics.length}`,
    `- Relevant error records: ${relevantDiagnostics.length}`,
    '',
    relevantDiagnostics.length > 0
      ? '| Source | Type | Status | URL | Message |'
      : '_No relevant framework/runtime errors were recorded._',
    relevantDiagnostics.length > 0 ? '| --- | --- | ---: | --- | --- |' : '',
    ...relevantDiagnostics.slice(0, 40).map((diagnostic) =>
      `| ${markdownEscape(diagnostic.source)} | ${diagnostic.type} | ${diagnostic.status || ''} | ${markdownEscape(diagnostic.url || '')} | ${markdownEscape(diagnostic.message.slice(0, 500))} |`
    ),
    relevantDiagnostics.length > 40 ? `\n_Additional diagnostics omitted: ${relevantDiagnostics.length - 40}_` : '',
    '',
    '## Blockers / Failures',
    '',
    report.blockers.length > 0
      ? report.blockers.map((blocker) => `- ${blocker}`).join('\n')
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

function addDiagnostics(page: Page, source: string, report: LiveReport) {
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    report.diagnostics.push({
      source,
      type: 'console',
      message: `[${message.type()}] ${message.text()}`,
      url: page.url(),
    });
  });

  page.on('pageerror', (error) => {
    report.diagnostics.push({
      source,
      type: 'pageerror',
      message: error.message,
      url: page.url(),
    });
  });

  page.on('requestfailed', (request) => {
    report.diagnostics.push({
      source,
      type: 'requestfailed',
      message: request.failure()?.errorText || 'Request failed',
      url: request.url(),
    });
  });

  page.on('response', (response) => {
    if (response.status() < 500) return;
    report.diagnostics.push({
      source,
      type: 'http',
      status: response.status(),
      message: response.statusText(),
      url: response.url(),
    });
  });
}

async function captureScreenshot(report: LiveReport, page: Page, label: string, fileName: string) {
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

  if (!isLoginVisible) {
    return;
  }

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

async function waitForVisibleAnswerInput(page: Page, timeout = 60_000) {
  await page.locator('input[type="text"]').first().waitFor({ state: 'visible', timeout });
}

async function votingOptionCount(page: Page): Promise<number> {
  return page.locator('button.w-full.p-3.rounded-xl.text-right').count();
}

async function clickConfirmationIfPresent(page: Page) {
  const dialog = page.locator('.fixed.inset-0').last();
  const confirmButton = dialog.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500');

  if (await confirmButton.isVisible({ timeout: 2_500 }).catch(() => false)) {
    try {
      await confirmButton.click({ timeout: 5_000, force: true });
    } catch (error) {
      const stillVisible = await confirmButton.isVisible({ timeout: 500 }).catch(() => false);
      if (stillVisible) {
        throw error;
      }
    }
  }
}

async function clickEditIfPresent(page: Page) {
  const dialog = page.locator('.fixed.inset-0').last();
  const editButton = dialog.locator('button').first();

  if (await editButton.isVisible({ timeout: 2_500 }).catch(() => false)) {
    await editButton.click();
  }
}

async function waitForAnsweringOrHandleCategorySelection(controllerPage: Page) {
  const deadline = Date.now() + 70_000;
  let latestText = '';

  while (Date.now() < deadline) {
    const input = controllerPage.locator('input[type="text"]').first();
    if (await input.isVisible().catch(() => false)) {
      return;
    }

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
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`${label} timed out after ${timeoutMs}ms. Latest value: ${JSON.stringify(latest)}`);
}

async function fetchGameByCode(code: string): Promise<GameRow> {
  const rows = await restSelect<GameRow>('games', {
    select: '*',
    code: `eq.${code}`,
    limit: '1',
  });

  if (!rows[0]) {
    throw new Error(`Game ${code} was not visible through REST.`);
  }

  return rows[0];
}

async function fetchPlayers(gameId: string): Promise<PlayerRow[]> {
  return await restSelect<PlayerRow>('players', {
    select: 'id,game_id,user_name,score,connection_status,joined_at',
    game_id: `eq.${gameId}`,
    order: 'joined_at.asc',
  });
}

async function fetchLatestRound(gameId: string): Promise<RoundRow> {
  const rows = await restSelect<RoundRow>('game_rounds', {
    select: '*',
    game_id: `eq.${gameId}`,
    order: 'round_number.desc',
    limit: '1',
  });

  if (!rows[0]) {
    throw new Error(`No rounds found for game ${gameId}.`);
  }

  return rows[0];
}

async function fetchRoundAnswers(roundId: string): Promise<AnswerRow[]> {
  return await restSelect<AnswerRow>('player_answers', {
    select: 'id,round_id,player_id,answer_text,is_correct',
    round_id: `eq.${roundId}`,
    order: 'submitted_at.asc',
  });
}

async function fetchQuestion(questionId: string): Promise<QuestionRow> {
  const rows = await restSelect<QuestionRow>('questions', {
    select: 'id,correct_answer',
    id: `eq.${questionId}`,
    limit: '1',
  });

  if (!rows[0]) {
    throw new Error(`Question ${questionId} was not found.`);
  }

  return rows[0];
}

async function fetchVotes(roundId: string): Promise<VoteRow[]> {
  return await restSelect<VoteRow>('votes', {
    select: 'id,round_id,voter_id,answer_id,points_earned',
    round_id: `eq.${roundId}`,
  });
}

function roundDeadlineMs(round: RoundRow): number {
  const startedAt = round.timer_starts_at ? new Date(round.timer_starts_at).getTime() : Date.now();
  return startedAt + (round.timer_duration * 1000);
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
  report: LiveReport,
  baseUrl: string,
  labelPrefix: string,
  playerCount: number
): Promise<RoomSession> {
  const hostContext = await browser.newContext({ viewport: TV_VIEWPORT, locale: 'ar-SA' });
  await authenticateHostContext(
    hostContext,
    process.env.FGSH_TEST_HOST_EMAIL!,
    process.env.FGSH_TEST_HOST_PASSWORD!
  );

  const tvPage = await hostContext.newPage();
  addDiagnostics(tvPage, `${labelPrefix} TV`, report);

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
  if (!code) {
    throw new Error('TV room code was not visible after room creation.');
  }

  const game = await fetchGameByCode(code);

  const joinPlayer = async (playerNumber: number): Promise<PlayerSession> => {
    const name = `${labelPrefix} P${String(playerNumber).padStart(2, '0')}`;
    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      locale: 'ar-SA',
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    addDiagnostics(page, name, report);

    await page.goto(routeUrl(baseUrl, `/join?code=${code}`), { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="text"]').first().fill(name);
    await Promise.all([
      page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 45_000 }),
      page.locator('.btn-gradient.btn-pink').first().click(),
    ]);

    const session = await storedGameSession(page);
    if (!session?.playerId) {
      throw new Error(`${name} joined but no player session was saved.`);
    }

    return { name, playerId: session.playerId, context, page };
  };

  const firstPlayer = await joinPlayer(1);
  const remainingPlayers = await Promise.all(
    Array.from({ length: playerCount - 1 }, (_, index) => joinPlayer(index + 2))
  );
  const players = [firstPlayer, ...remainingPlayers];
  await expect.poll(async () => (await fetchPlayers(game.id)).length, { timeout: 30_000 }).toBe(playerCount);

  return {
    code,
    gameId: game.id,
    hostContext,
    tvPage,
    players,
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

async function submitAllAnswers(room: RoomSession, answerPrefix: string): Promise<Map<string, string>> {
  const submittedAnswers = new Map<string, string>();

  await Promise.all(room.players.map(async (player, index) => {
    const answer = `${answerPrefix} answer ${index + 1} ${Date.now()}`;
    submittedAnswers.set(player.playerId, answer);

    await submitAnswerText(player, answer);
  }));

  await Promise.all(room.players.map((player) =>
    expect.poll(async () => votingOptionCount(player.page), { timeout: 15_000 }).toBeGreaterThan(1)
  ));

  return submittedAnswers;
}

async function submitAnswerText(player: PlayerSession, answer: string) {
  const input = player.page.locator('input[type="text"]').first();
  await input.fill(answer);
  await player.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click();
  await clickConfirmationIfPresent(player.page);
  await expect.poll(async () => {
    const inputVisible = await input.isVisible().catch(() => false);
    const optionCount = await votingOptionCount(player.page).catch(() => 0);
    return !inputVisible || optionCount > 1;
  }, { timeout: 30_000 }).toBe(true);
}

async function waitForRoundStatus(gameId: string, status: string, timeoutMs: number): Promise<RoundRow> {
  return await pollUntil(
    () => fetchLatestRound(gameId),
    (round) => round.status === status,
    timeoutMs,
    `round status ${status}`
  );
}

async function voteForAnswerText(page: Page, answerText: string) {
  const option = page
    .locator('button.w-full.p-3.rounded-xl.text-right')
    .filter({ hasText: answerText })
    .first();

  await expect(option, `vote option for "${answerText}"`).toBeVisible({ timeout: 10_000 });
  await expect(option).toBeEnabled({ timeout: 5_000 });
  await option.click();
  await clickConfirmationIfPresent(page);
}

async function forceFrozenLifecycle(page: Page): Promise<string> {
  const session = await page.context().newCDPSession(page);
  await session.send('Page.setWebLifecycleState', { state: 'frozen' });
  return 'Chrome Page.setWebLifecycleState(frozen)';
}

async function waitPastDeadline(round: RoundRow, graceMs: number) {
  const waitMs = Math.max(0, roundDeadlineMs(round) + graceMs - Date.now());
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function runCase(
  report: LiveReport,
  label: string,
  fn: () => Promise<string>
) {
  const startedAt = Date.now();

  try {
    const details = await fn();
    report.cases.push({
      label,
      status: 'pass',
      durationMs: Date.now() - startedAt,
      details,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.cases.push({
      label,
      status: 'fail',
      durationMs: Date.now() - startedAt,
      details: message,
    });
    report.blockers.push(`${label}: ${message}`);
  } finally {
    report.status = report.cases.some((item) => item.status === 'fail') ? 'fail' : 'pass';
    report.completedAt = new Date().toISOString();
    await writeReport(report);
  }
}

async function runDeterministicVoteAndScoreCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'VoteScore', 3);
    await startGame(room);
    await submitAllAnswers(room, 'VoteScore');
    const round = await waitForRoundStatus(room.gameId, 'voting', 15_000);

    const answers = await pollUntil(
      () => fetchRoundAnswers(round.id),
      (rows) => rows.filter((row) => row.player_id).length === 3 && rows.some((row) => row.is_correct && !row.player_id),
      10_000,
      'round answers including system truth'
    );
    const answerByPlayer = new Map(answers.filter((answer) => answer.player_id).map((answer) => [answer.player_id!, answer]));
    const correctAnswer = answers.find((answer) => answer.is_correct && !answer.player_id);
    const [p1, p2, p3] = room.players;

    const p1Answer = answerByPlayer.get(p1.playerId);
    const p2Answer = answerByPlayer.get(p2.playerId);
    if (!p1Answer || !p2Answer || !correctAnswer) {
      throw new Error('Could not map player answers and correct answer for deterministic voting.');
    }

    await voteForAnswerText(p1.page, p2Answer.answer_text);
    await voteForAnswerText(p2.page, p1Answer.answer_text);
    await voteForAnswerText(p3.page, correctAnswer.answer_text);
    await waitForRoundStatus(room.gameId, 'completed', 30_000);

    const votes = await pollUntil(
      () => fetchVotes(round.id),
      (rows) => rows.length === 3,
      10_000,
      'three persisted vote rows'
    );
    const votesByVoter = new Map(votes.map((vote) => [vote.voter_id, vote]));

    const expectedVotes = new Map([
      [p1.playerId, p2Answer.id],
      [p2.playerId, p1Answer.id],
      [p3.playerId, correctAnswer.id],
    ]);
    const expectedVotePoints = new Map([
      [p1.playerId, 0],
      [p2.playerId, 0],
      [p3.playerId, 1000],
    ]);

    for (const [voterId, expectedAnswerId] of expectedVotes) {
      const persistedVote = votesByVoter.get(voterId);
      if (!persistedVote) {
        throw new Error(`Missing persisted vote for ${voterId}.`);
      }
      if (persistedVote.answer_id !== expectedAnswerId) {
        throw new Error(`Vote mismatch for ${voterId}: expected ${expectedAnswerId}, got ${persistedVote.answer_id}.`);
      }
      const expectedPoints = expectedVotePoints.get(voterId);
      if (expectedPoints !== undefined && persistedVote.points_earned !== expectedPoints) {
        throw new Error(`Vote points mismatch for ${voterId}: expected ${expectedPoints}, got ${persistedVote.points_earned}.`);
      }
    }

    const expectedScores = new Map([
      [p1.playerId, 500],
      [p2.playerId, 500],
      [p3.playerId, 1000],
    ]);
    const players = await pollUntil(
      () => fetchPlayers(room!.gameId),
      (rows) => rows.every((player) => expectedScores.get(player.id) === undefined || player.score === expectedScores.get(player.id)),
      10_000,
      'expected deterministic scores'
    );

    await captureScreenshot(report, room.tvPage, 'Deterministic vote scoring reveal', 'vote-score-reveal.png');
    const scoreSummary = players.map((player) => `${player.user_name}:${player.score}`).join(', ');
    const votePointSummary = votes.map((vote) => `${vote.voter_id}:${vote.points_earned}`).join(', ');
    return `All 3 votes persisted exactly once, vote points matched, and scores matched expected totals (${scoreSummary}; vote points ${votePointSummary}).`;
  } finally {
    await closeRoom(room);
  }
}

async function runSystemFakePenaltyScoreCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'SysFake', 3);
    await startGame(room);
    await submitAllAnswers(room, 'SysFake');
    const round = await waitForRoundStatus(room.gameId, 'voting', 15_000);

    const answers = await pollUntil(
      () => fetchRoundAnswers(round.id),
      (rows) =>
        rows.filter((row) => row.player_id).length === 3 &&
        rows.some((row) => row.is_correct && !row.player_id),
      10_000,
      'round answers including system truth'
    );
    const answerByPlayer = new Map(answers.filter((answer) => answer.player_id).map((answer) => [answer.player_id!, answer]));
    const correctAnswer = answers.find((answer) => answer.is_correct && !answer.player_id);
    const systemFakeAnswer = answers.find((answer) => !answer.is_correct && !answer.player_id);
    const [p1, p2, p3] = room.players;

    const p2Answer = answerByPlayer.get(p2.playerId);
    if (!p2Answer || !correctAnswer) {
      throw new Error('Could not map player fake and correct answer for system-fake scoring.');
    }

    if (!systemFakeAnswer) {
      return 'No system fake answer was injected in this live round, so the system-fake penalty path was not exercised.';
    }

    await voteForAnswerText(p1.page, p2Answer.answer_text);
    await voteForAnswerText(p2.page, systemFakeAnswer.answer_text);
    await voteForAnswerText(p3.page, correctAnswer.answer_text);
    await waitForRoundStatus(room.gameId, 'completed', 30_000);

    const votes = await pollUntil(
      () => fetchVotes(round.id),
      (rows) => rows.length === 3,
      10_000,
      'three persisted vote rows for system fake scoring'
    );
    const votesByVoter = new Map(votes.map((vote) => [vote.voter_id, vote]));

    const expectedVotes = new Map([
      [p1.playerId, p2Answer.id],
      [p2.playerId, systemFakeAnswer.id],
      [p3.playerId, correctAnswer.id],
    ]);
    const expectedVotePoints = new Map([
      [p1.playerId, 0],
      [p2.playerId, -500],
      [p3.playerId, 1000],
    ]);

    for (const [voterId, expectedAnswerId] of expectedVotes) {
      const persistedVote = votesByVoter.get(voterId);
      if (!persistedVote) {
        throw new Error(`Missing persisted vote for ${voterId}.`);
      }
      if (persistedVote.answer_id !== expectedAnswerId) {
        throw new Error(`Vote mismatch for ${voterId}: expected ${expectedAnswerId}, got ${persistedVote.answer_id}.`);
      }
      const expectedPoints = expectedVotePoints.get(voterId);
      if (expectedPoints !== undefined && persistedVote.points_earned !== expectedPoints) {
        throw new Error(`Vote points mismatch for ${voterId}: expected ${expectedPoints}, got ${persistedVote.points_earned}.`);
      }
    }

    const expectedScores = new Map([
      [p1.playerId, 0],
      [p2.playerId, 0],
      [p3.playerId, 1000],
    ]);
    const players = await pollUntil(
      () => fetchPlayers(room!.gameId),
      (rows) => rows.every((player) => expectedScores.get(player.id) === undefined || player.score === expectedScores.get(player.id)),
      10_000,
      'expected system fake scores'
    );

    await captureScreenshot(report, room.tvPage, 'System fake penalty scoring reveal', 'system-fake-penalty-reveal.png');
    const scoreSummary = players.map((player) => `${player.user_name}:${player.score}`).join(', ');
    const votePointSummary = votes.map((vote) => `${vote.voter_id}:${vote.points_earned}`).join(', ');
    return `System fake penalty, fake-owner reward, and correct-vote reward matched expected totals (${scoreSummary}; vote points ${votePointSummary}).`;
  } finally {
    await closeRoom(room);
  }
}

async function runCorrectSubmissionFakeOnlyVotingCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const correctSubmitterMessage =
    'You submitted the correct answer. You will receive correct-answer points, but no vote points from this answer. Your vote this round will not affect scores.';

  try {
    room = await createRoom(browser, report, baseUrl, 'TruthSubmit', 3);
    await startGame(room);

    const answeringRound = await waitForRoundStatus(room.gameId, 'answering', 15_000);
    const question = await fetchQuestion(answeringRound.question_id);
    const [truthSubmitter, fakeOwner, normalVoter] = room.players;
    const fakeOwnerAnswerText = `TruthSubmit fake owner ${Date.now()}`;
    const normalVoterAnswerText = `TruthSubmit normal fake ${Date.now()}`;

    await Promise.all([
      submitAnswerText(truthSubmitter, question.correct_answer),
      submitAnswerText(fakeOwner, fakeOwnerAnswerText),
      submitAnswerText(normalVoter, normalVoterAnswerText),
    ]);

    const round = await waitForRoundStatus(room.gameId, 'voting', 15_000);
    const answers = await pollUntil(
      () => fetchRoundAnswers(round.id),
      (rows) => (
        rows.some((row) => row.player_id === truthSubmitter.playerId && row.is_correct) &&
        rows.some((row) => row.is_correct && !row.player_id) &&
        rows.some((row) => row.player_id === fakeOwner.playerId && row.answer_text === fakeOwnerAnswerText)
      ),
      10_000,
      'truth submitter answer, fake owner answer, and system truth'
    );

    const systemCorrectAnswer = answers.find((answer) => answer.is_correct && !answer.player_id);
    const truthSubmitterAnswer = answers.find((answer) => answer.player_id === truthSubmitter.playerId);
    const fakeOwnerAnswer = answers.find((answer) => answer.player_id === fakeOwner.playerId);

    if (!systemCorrectAnswer || !truthSubmitterAnswer || !fakeOwnerAnswer) {
      throw new Error('Could not map correct-submission test answers.');
    }

    await expect(truthSubmitter.page.getByText(correctSubmitterMessage)).toBeVisible({ timeout: 10_000 });
    const truthSubmitterOptionTexts = await truthSubmitter.page
      .locator('button.w-full.p-3.rounded-xl.text-right')
      .allInnerTexts();

    if (truthSubmitterOptionTexts.length === 0) {
      throw new Error('Truth submitter had no fake answers available to vote for.');
    }

    if (truthSubmitterOptionTexts.some((text) => normalize(text) === normalize(question.correct_answer))) {
      throw new Error('Truth submitter could still see the official correct answer as a voting option.');
    }

    await expect(
      fakeOwner.page
        .locator('button.w-full.p-3.rounded-xl.text-right')
        .filter({ hasText: question.correct_answer })
        .first()
    ).toBeVisible({ timeout: 10_000 });

    const truthSubmitterSession = await storedGameSession(truthSubmitter.page);
    if (!truthSubmitterSession?.playerToken) {
      throw new Error('Truth submitter session token was not available for RPC probe.');
    }

    const rejectedCorrectVote = await restRpc<VoteRow>('cast_vote', {
      p_round_id: round.id,
      p_voter_id: truthSubmitter.playerId,
      p_player_token: truthSubmitterSession.playerToken,
      p_answer_id: systemCorrectAnswer.id,
    });

    if (rejectedCorrectVote.ok) {
      throw new Error('cast_vote allowed a correct-answer submitter to vote for the official correct answer.');
    }

    if (!rejectedCorrectVote.text.includes('Correct-answer submitters cannot vote for the correct answer')) {
      throw new Error(`Unexpected RPC rejection for correct submitter truth vote: HTTP ${rejectedCorrectVote.status} ${rejectedCorrectVote.text.slice(0, 200)}`);
    }

    const votesAfterRejectedRpc = await fetchVotes(round.id);
    if (votesAfterRejectedRpc.some((vote) => vote.voter_id === truthSubmitter.playerId)) {
      throw new Error('Rejected correct-answer vote still persisted a vote row.');
    }

    await captureScreenshot(report, truthSubmitter.page, 'Correct submitter fake-only voting options', 'correct-submitter-fake-only-voting.png');

    await voteForAnswerText(truthSubmitter.page, fakeOwnerAnswer.answer_text);
    await voteForAnswerText(fakeOwner.page, systemCorrectAnswer.answer_text);
    await voteForAnswerText(normalVoter.page, systemCorrectAnswer.answer_text);

    await waitForRoundStatus(room.gameId, 'completed', 30_000);

    const votes = await pollUntil(
      () => fetchVotes(round.id),
      (rows) => rows.length === 3,
      10_000,
      'three persisted votes after correct-submission voting'
    );
    const votesByVoter = new Map(votes.map((vote) => [vote.voter_id, vote]));
    const truthSubmitterVote = votesByVoter.get(truthSubmitter.playerId);
    const fakeOwnerVote = votesByVoter.get(fakeOwner.playerId);
    const normalVoterVote = votesByVoter.get(normalVoter.playerId);

    if (truthSubmitterVote?.answer_id !== fakeOwnerAnswer.id) {
      throw new Error(`Truth submitter fake vote mismatch: expected ${fakeOwnerAnswer.id}, got ${truthSubmitterVote?.answer_id || 'none'}.`);
    }
    if (fakeOwnerVote?.answer_id !== systemCorrectAnswer.id || normalVoterVote?.answer_id !== systemCorrectAnswer.id) {
      throw new Error('Normal voters did not persist votes for the official correct answer.');
    }

    const scoredVotes = await pollUntil(
      () => fetchVotes(round.id),
      (rows) => (
        rows.length === 3 &&
        rows.some((vote) => vote.voter_id === truthSubmitter.playerId && vote.points_earned === 0) &&
        rows.some((vote) => vote.voter_id === fakeOwner.playerId && vote.points_earned === 1000) &&
        rows.some((vote) => vote.voter_id === normalVoter.playerId && vote.points_earned === 1000)
      ),
      10_000,
      'expected correct-submission vote point rows'
    );

    const expectedScores = new Map([
      [truthSubmitter.playerId, 1000],
      [fakeOwner.playerId, 1000],
      [normalVoter.playerId, 1000],
    ]);
    const players = await pollUntil(
      () => fetchPlayers(room!.gameId),
      (rows) => rows.every((player) => expectedScores.get(player.id) === undefined || player.score === expectedScores.get(player.id)),
      10_000,
      'expected correct-submission player scores'
    );

    await expect(
      room.tvPage
        .locator('.from-green-500.to-green-600')
        .filter({ hasText: systemCorrectAnswer.answer_text })
        .filter({ hasText: truthSubmitter.name })
        .first()
    ).toBeVisible({ timeout: 90_000 });
    await captureScreenshot(report, room.tvPage, 'Correct submission reveal grouped with official answer', 'correct-submission-reveal.png');

    const scoreSummary = players.map((player) => `${player.user_name}:${player.score}`).join(', ');
    const votePointSummary = scoredVotes.map((vote) => `${vote.voter_id}:${vote.points_earned}`).join(', ');
    return `Correct submitter saw fake-only voting, RPC rejected truth vote, correct-submission reward was applied, fake vote had zero score effect, and scores matched (${scoreSummary}; vote points ${votePointSummary}).`;
  } finally {
    await closeRoom(room);
  }
}

async function runNearTimeoutOptimisticVoteCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'LateVote', 3);
    await startGame(room);
    await submitAllAnswers(room, 'LateVote');
    const round = await waitForRoundStatus(room.gameId, 'voting', 15_000);
    const answers = await pollUntil(
      () => fetchRoundAnswers(round.id),
      (rows) => rows.some((row) => row.is_correct && !row.player_id),
      10_000,
      'system correct answer'
    );
    const correctAnswer = answers.find((answer) => answer.is_correct && !answer.player_id);
    if (!correctAnswer) {
      throw new Error('Could not locate system correct answer for late vote test.');
    }

    const lateVoter = room.players[1];
    const clickAtMs = roundDeadlineMs(round) - 1_500;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, clickAtMs - Date.now())));

    const option = lateVoter.page
      .locator('button.w-full.p-3.rounded-xl.text-right')
      .filter({ hasText: correctAnswer.answer_text })
      .first();
    await expect(option).toBeVisible({ timeout: 5_000 });
    await option.click();

    const selectedCount = await lateVoter.page.locator('button.bg-cyan-500').count().catch(() => 0);
    await captureScreenshot(report, lateVoter.page, 'Late vote selected before confirmation timeout', 'late-vote-selected.png');
    await lateVoter.page.waitForTimeout(8_000);

    const votes = await fetchVotes(round.id);
    const lateVote = votes.find((vote) => vote.voter_id === lateVoter.playerId);

    if (selectedCount > 0 && !lateVote) {
      throw new Error('Reproduced vote UI mismatch: answer was visibly selected near timer zero, but no vote row persisted.');
    }

    return lateVote
      ? 'Late selected vote persisted; no selected-without-vote mismatch observed.'
      : 'No late vote persisted and no selected UI state was observed.';
  } finally {
    await closeRoom(room);
  }
}

async function runActiveAnswerTimeoutCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'AnswerZero', 2);
    await startGame(room);
    const answeringRound = await waitForRoundStatus(room.gameId, 'answering', 15_000);
    await waitPastDeadline(answeringRound, ANSWER_TIMEOUT_GRACE_MS);

    const roundAfterTimeout = await fetchLatestRound(room.gameId);
    await captureScreenshot(report, room.players[0].page, 'Active controller answer timer after zero', 'active-answer-timeout-controller.png');

    if (roundAfterTimeout.status === 'answering') {
      throw new Error('Answer timer reached zero with active controller, but the round remained in answering.');
    }

    return `Answer timer reached zero with active controller and advanced to ${roundAfterTimeout.status}.`;
  } finally {
    await closeRoom(room);
  }
}

async function runFrozenControllerTimeoutCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'FrozenHost', 2);
    await startGame(room);
    const answeringRound = await waitForRoundStatus(room.gameId, 'answering', 15_000);
    const freezeMethod = await forceFrozenLifecycle(room.players[0].page);
    await waitPastDeadline(answeringRound, ANSWER_TIMEOUT_GRACE_MS);

    const roundAfterTimeout = await fetchLatestRound(room.gameId);
    await captureScreenshot(report, room.players[1].page, 'Frozen controller answer timer after zero', 'frozen-controller-answer-timeout-noncontroller.png');

    if (roundAfterTimeout.status === 'answering') {
      throw new Error(`Reproduced host-dependent timer stall: controller was frozen via ${freezeMethod}, deadline passed, and round remained answering.`);
    }

    return `Frozen controller did not stall answer timer; round advanced to ${roundAfterTimeout.status}.`;
  } finally {
    await closeRoom(room);
  }
}

async function runBlockedControllerForceAdvanceCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'BlockedTimer', 2);
    await startGame(room);
    await room.players[0].page.route('**/rest/v1/rpc/force_advance_round_as_player', (route) => route.abort('failed'));

    const answeringRound = await waitForRoundStatus(room.gameId, 'answering', 15_000);
    await waitPastDeadline(answeringRound, ANSWER_TIMEOUT_GRACE_MS);

    const roundAfterTimeout = await fetchLatestRound(room.gameId);
    await captureScreenshot(report, room.players[1].page, 'Blocked controller force-advance after answer timer zero', 'blocked-controller-force-advance.png');

    if (roundAfterTimeout.status === 'answering') {
      throw new Error('Reproduced timer dependency: controller stayed connected but its force-advance RPC was blocked, another player was active, and the round remained answering after deadline.');
    }

    return `Blocked controller force-advance did not stall the timer; round advanced to ${roundAfterTimeout.status}.`;
  } finally {
    await closeRoom(room);
  }
}

async function runActiveVotingTimeoutCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'VoteZero', 3);
    await startGame(room);
    await submitAllAnswers(room, 'VoteZero');
    const votingRound = await waitForRoundStatus(room.gameId, 'voting', 15_000);
    await waitPastDeadline(votingRound, VOTE_TIMEOUT_GRACE_MS);

    const roundAfterTimeout = await fetchLatestRound(room.gameId);
    await captureScreenshot(report, room.players[0].page, 'Active controller voting timer after zero', 'active-voting-timeout-controller.png');

    if (roundAfterTimeout.status === 'voting') {
      throw new Error('Voting timer reached zero with active controller, but the round remained in voting.');
    }

    return `Voting timer reached zero with active controller and advanced to ${roundAfterTimeout.status}.`;
  } finally {
    await closeRoom(room);
  }
}

async function completeFullGame(room: RoomSession, report: LiveReport) {
  for (let roundNumber = 1; roundNumber <= 7; roundNumber += 1) {
    await waitForAnsweringOrHandleCategorySelection(room.players[0].page);
    await Promise.all(room.players.map((player) => waitForVisibleAnswerInput(player.page)));
    await submitAllAnswers(room, `Replay R${roundNumber}`);

    const round = await waitForRoundStatus(room.gameId, 'voting', 15_000);
    const answers = await pollUntil(
      () => fetchRoundAnswers(round.id),
      (rows) => rows.filter((row) => row.player_id).length >= room.players.length,
      10_000,
      `round ${roundNumber} answers`
    );
    const answerByPlayer = new Map(answers.filter((answer) => answer.player_id).map((answer) => [answer.player_id!, answer]));
    const [p1, p2] = room.players;
    const p1Answer = answerByPlayer.get(p1.playerId);
    const p2Answer = answerByPlayer.get(p2.playerId);

    if (!p1Answer || !p2Answer) {
      throw new Error(`Round ${roundNumber}: could not map both player answers.`);
    }

    await voteForAnswerText(p1.page, p2Answer.answer_text);
    await voteForAnswerText(p2.page, p1Answer.answer_text);
    await waitForRoundStatus(room.gameId, 'completed', 30_000);

    if (roundNumber < 7) {
      const nextButton = p1.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first();
      await expect.poll(async () => nextButton.isEnabled().catch(() => false), { timeout: 90_000 }).toBe(true);
      await nextButton.click();
    } else {
      await captureScreenshot(report, p1.page, 'Replay case final round completed', 'play-again-final-round-completed.png');
      const resultsButton = p1.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first();
      await expect.poll(async () => resultsButton.isEnabled().catch(() => false), { timeout: 90_000 }).toBe(true);
      await Promise.all([
        p1.page.waitForURL(/\/results(?:\?|$)/, { timeout: 30_000 }),
        resultsButton.click(),
      ]);
      await p2.page.waitForURL(/\/results(?:\?|$)/, { timeout: 45_000 }).catch(() => undefined);
    }
  }
}

async function runPlayAgainLeaverRejoinCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'Replay', 2);
    await startGame(room);
    await completeFullGame(room, report);

    const [controller, leaver] = room.players;
    await expect(controller.page).toHaveURL(/\/results(?:\?|$)/, { timeout: 30_000 });

    const replayButton = controller.page.locator('button.bg-gradient-to-r.from-cyan-500.to-blue-500').first();
    await expect(replayButton).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      controller.page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 45_000 }),
      replayButton.click(),
    ]);

    await leaver.page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 45_000 });
    const leaveButton = leaver.page.locator('button').last();
    await leaveButton.click();
    await leaver.page.waitForURL(/\/(?:\?|$)/, { timeout: 15_000 }).catch(() => undefined);

    const sessionAfterLeave = await storedGameSession(leaver.page);
    await captureScreenshot(report, leaver.page, 'Play Again leaver after pressing leave', 'play-again-leaver-after-leave.png');

    await leaver.page.goto(routeUrl(baseUrl, `/join?code=${room.code}`), { waitUntil: 'domcontentloaded' });
    await leaver.page.locator('input[type="text"]').first().fill(leaver.name);
    await Promise.allSettled([
      leaver.page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 15_000 }),
      leaver.page.locator('.btn-gradient.btn-pink').first().click(),
    ]);

    const rejoined = /\/lobby(?:\?|$)/.test(new URL(leaver.page.url()).pathname);
    if (!rejoined) {
      const body = await pageText(leaver.page).catch(() => '');
      throw new Error(
        `Reproduced Play Again leaver rejoin failure. Saved session present after leave: ${!!sessionAfterLeave}. URL: ${leaver.page.url()}. Text: ${body.slice(0, 300)}`
      );
    }

    return `Leaver rejoined the restarted lobby successfully. Saved session present after leave: ${!!sessionAfterLeave}.`;
  } finally {
    await closeRoom(room);
  }
}

async function runLongTextLayoutCase(browser: Browser, report: LiveReport, baseUrl: string): Promise<string> {
  let room: RoomSession | undefined;

  try {
    room = await createRoom(browser, report, baseUrl, 'Layout', 3);
    await startGame(room);

    const longQuestion = 'اختبار سؤال طويل جدا جدا جدا يحتوي على كلمات عربية كثيرة ومسافات متعددة للتأكد من أن النص لا يتداخل مع العداد أو عناصر الشاشة الأخرى عندما يكون السؤال أطول بكثير من المتوقع في غرفة التلفاز';

    const tvLayout = await room.tvPage.evaluate((questionText) => {
      const headings = Array.from(document.querySelectorAll('h2'));
      const target = headings.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] as HTMLElement | undefined;
      if (!target) {
        return { found: false, fitsParent: false, details: 'No h2 element found.' };
      }

      target.textContent = questionText;
      const parent = target.parentElement as HTMLElement | null;
      const targetRect = target.getBoundingClientRect();
      const parentRect = parent?.getBoundingClientRect();

      return {
        found: true,
        fitsParent: !!parent &&
          target.scrollHeight <= parent.clientHeight &&
          targetRect.top >= parentRect!.top &&
          targetRect.bottom <= parentRect!.bottom,
        details: `h2 scrollHeight=${target.scrollHeight}, parent clientHeight=${parent?.clientHeight ?? 0}, target bottom=${targetRect.bottom.toFixed(1)}, parent bottom=${parentRect?.bottom.toFixed(1) ?? 'n/a'}`,
      };
    }, longQuestion);

    await captureScreenshot(report, room.tvPage, 'Long TV question layout', 'long-tv-question-layout.png');

    await submitAllAnswers(room, 'Layout');
    await waitForRoundStatus(room.gameId, 'voting', 15_000);

    const longAnswer = 'كلمةطويلةجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجداجدا';
    const mobileLayout = await room.players[0].page.evaluate((answerText) => {
      const buttons = Array.from(document.querySelectorAll('button.w-full.p-3.rounded-xl.text-right')) as HTMLElement[];
      buttons.slice(0, 2).forEach((button) => {
        button.textContent = answerText;
      });

      const overflowed = buttons.some((button) => button.scrollWidth > button.clientWidth || button.scrollHeight > button.clientHeight + 4);
      return {
        found: buttons.length > 0,
        fitsParent: !overflowed,
        details: buttons.slice(0, 2).map((button, index) =>
          `button${index + 1} scroll=${button.scrollWidth}x${button.scrollHeight} client=${button.clientWidth}x${button.clientHeight}`
        ).join('; '),
      };
    }, longAnswer);

    await captureScreenshot(report, room.players[0].page, 'Long mobile voting answer layout', 'long-mobile-answer-layout.png');

    const failures = [
      !tvLayout.found ? 'TV question target missing' : !tvLayout.fitsParent ? `TV question overflow/clipping detected (${tvLayout.details})` : '',
      !mobileLayout.found ? 'Mobile vote buttons missing' : !mobileLayout.fitsParent ? `Mobile answer overflow/clipping detected (${mobileLayout.details})` : '',
    ].filter(Boolean);

    if (failures.length > 0) {
      throw new Error(failures.join(' | '));
    }

    return `Long text fit checks passed. TV: ${tvLayout.details}. Mobile: ${mobileLayout.details}.`;
  } finally {
    await closeRoom(room);
  }
}

test.describe('live targeted regression battery', () => {
  test('reproduces vote, timer, rejoin, and layout edge cases on the live deployment', async () => {
    test.setTimeout(1_200_000);

    const report = createInitialReport();
    let browser: Browser | undefined;

    try {
      const missingEnv = ['FGSH_TEST_BASE_URL', 'FGSH_TEST_HOST_EMAIL', 'FGSH_TEST_HOST_PASSWORD']
        .filter((key) => !process.env[key]);

      if (missingEnv.length > 0) {
        throw new Error(`Missing required env vars: ${missingEnv.join(', ')}`);
      }

      const baseUrl = normalizeBaseUrl(process.env.FGSH_TEST_BASE_URL!);
      report.targetUrl = baseUrl;
      const executablePath = resolveBrowserExecutable();
      browser = await chromium.launch(executablePath ? { executablePath } : undefined);

      const caseFilters = (process.env.FGSH_LIVE_REGRESSION_CASE_FILTER || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      const shouldRunCase = (label: string) =>
        caseFilters.length === 0 || caseFilters.some((filter) => label.toLowerCase().includes(filter));
      let selectedCaseCount = 0;
      const runSelectedCase = async (label: string, execute: () => Promise<string>) => {
        if (!shouldRunCase(label)) {
          return;
        }
        selectedCaseCount += 1;
        await runCase(report, label, execute);
      };

      await runSelectedCase('Deterministic vote registration and scoring', () =>
        runDeterministicVoteAndScoreCase(browser!, report, baseUrl)
      );
      await runSelectedCase('System fake penalty and fake-owner scoring', () =>
        runSystemFakePenaltyScoreCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Correct submitter sees fake-only voting and correct-submission reward', () =>
        runCorrectSubmissionFakeOnlyVotingCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Near-timeout selected vote must persist or clear cleanly', () =>
        runNearTimeoutOptimisticVoteCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Answer timer reaches zero with active controller', () =>
        runActiveAnswerTimeoutCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Answer timer reaches zero with frozen controller', () =>
        runFrozenControllerTimeoutCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Answer timer with controller force-advance RPC blocked', () =>
        runBlockedControllerForceAdvanceCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Voting timer reaches zero with active controller', () =>
        runActiveVotingTimeoutCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Play Again leaver can rejoin same lobby', () =>
        runPlayAgainLeaverRejoinCase(browser!, report, baseUrl)
      );
      await runSelectedCase('Long question and answer text does not overlap or clip', () =>
        runLongTextLayoutCase(browser!, report, baseUrl)
      );

      if (selectedCaseCount === 0) {
        throw new Error(`No live regression cases matched FGSH_LIVE_REGRESSION_CASE_FILTER=${process.env.FGSH_LIVE_REGRESSION_CASE_FILTER}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.blockers.push(message);
      report.status = 'fail';
      throw error;
    } finally {
      report.completedAt = new Date().toISOString();
      report.status = report.cases.some((item) => item.status === 'fail') || report.blockers.length > 0 ? 'fail' : 'pass';
      await writeReport(report);
      await browser?.close();
    }

    const failedCases = report.cases.filter((item) => item.status === 'fail');
    expect(
      failedCases.map((item) => `${item.label}: ${item.details}`).join('\n'),
      'live regression battery failures'
    ).toBe('');
  });
});
