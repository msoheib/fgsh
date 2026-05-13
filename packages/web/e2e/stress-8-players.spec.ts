import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYER_COUNT = Number.parseInt(process.env.FGSH_STRESS_PLAYER_COUNT || '8', 10);
const REPORT_DATE = process.env.FGSH_STRESS_REPORT_DATE || '2026-05-09';
const TEST_NAME = `stress-${PLAYER_COUNT}-players`;
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TV_VIEWPORT = { width: 1440, height: 900 };

type CheckStatus = 'pass' | 'fail' | 'not run';

interface CheckResult {
  label: string;
  status: CheckStatus;
  details: string;
}

interface TimingRow {
  phase: string;
  actor: string;
  ms: number;
  status: CheckStatus;
  details?: string;
}

interface ScreenshotRow {
  label: string;
  relativePath: string;
}

interface DiagnosticRow {
  source: string;
  type: 'console' | 'pageerror' | 'requestfailed' | 'http';
  message: string;
  url?: string;
  status?: number;
}

interface CategoryFlashEvent {
  elapsedMs: number;
  url: string;
  textSample: string;
}

interface CategoryFlashWatcher {
  events: CategoryFlashEvent[];
  stop: () => Promise<CategoryFlashEvent[]>;
}

interface PlayerSession {
  name: string;
  context: BrowserContext;
  page: Page;
}

interface StressReport {
  startedAt: string;
  completedAt?: string;
  targetUrl: string;
  browser: string;
  viewportStrategy: string;
  gameCode?: string;
  status: CheckStatus;
  checks: CheckResult[];
  timings: TimingRow[];
  screenshots: ScreenshotRow[];
  diagnostics: DiagnosticRow[];
  blockers: string[];
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

const checkLabels = {
  env: 'Required environment variables are present',
  hostRoom: 'Host can log in and create a TV room',
  playerJoins: `${PLAYER_COUNT} players join successfully`,
  tvLobbyCount: `TV lobby displays ${PLAYER_COUNT} / 10 players`,
  gameStarts: 'Game starts for TV and players',
  answersConfirmed: `All ${PLAYER_COUNT} answers confirm`,
  answerQuorumAdvance: 'Voting opens promptly after answer quorum',
  votingOpens: 'Voting opens for all players',
  votesConfirmed: `All ${PLAYER_COUNT} votes confirm`,
  roundCompleted: 'Round reaches completed/reveal state',
  noCategoryFlash: 'No unexpected TV category-selection flash after answering begins',
  diagnosticsClean: 'No relevant framework/runtime errors',
} satisfies Record<string, string>;

function createInitialReport(): StressReport {
  return {
    startedAt: new Date().toISOString(),
    targetUrl: process.env.FGSH_TEST_BASE_URL || '(missing)',
    browser: 'chromium',
    viewportStrategy: `TV/host ${TV_VIEWPORT.width}x${TV_VIEWPORT.height}; players ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height} in ${PLAYER_COUNT} isolated contexts`,
    status: 'not run',
    checks: Object.values(checkLabels).map((label) => ({
      label,
      status: 'not run',
      details: 'Not reached.',
    })),
    timings: [],
    screenshots: [],
    diagnostics: [],
    blockers: [],
  };
}

function setCheck(report: StressReport, label: string, status: CheckStatus, details: string) {
  const check = report.checks.find((item) => item.label === label);
  if (check) {
    check.status = status;
    check.details = details;
    return;
  }

  report.checks.push({ label, status, details });
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

function routeUrl(baseUrl: string, route: string): string {
  return `${baseUrl}${route}`;
}

function markdownEscape(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function isRelevantDiagnostic(item: DiagnosticRow): boolean {
  if (
    item.message.includes('net::ERR_ABORTED') &&
    /\.(woff2?|wav|mp3|ogg|png|jpe?g|webp|svg)(?:\?|$)/i.test(item.url || '')
  ) {
    return false;
  }

  if (
    /could not autoplay|play\(\) request was interrupted|AudioContext encountered an error from the audio device|WebAudio renderer/i
      .test(item.message)
  ) {
    return false;
  }

  return item.type === 'pageerror' ||
    item.type === 'requestfailed' ||
    (item.type === 'console' && /error|exception|failed/i.test(item.message)) ||
    (item.type === 'http' && (item.status || 0) >= 500);
}

async function ensureReportDirs() {
  await fs.mkdir(screenshotDir, { recursive: true });
}

async function writeReport(report: StressReport) {
  await ensureReportDirs();
  const completedAt = report.completedAt || new Date().toISOString();
  const relevantDiagnostics = report.diagnostics.filter(isRelevantDiagnostic);

  const lines = [
    `# ${PLAYER_COUNT}-Player Stress Test Report`,
    '',
    `- Status: **${report.status.toUpperCase()}**`,
    `- Target URL: ${report.targetUrl}`,
    `- Started: ${report.startedAt}`,
    `- Completed: ${completedAt}`,
    `- Browser: ${report.browser}`,
    `- Viewports: ${report.viewportStrategy}`,
    '- Credentials: supplied through environment variables and intentionally not logged.',
    report.gameCode ? `- Game code: ${report.gameCode}` : '- Game code: not created.',
    '',
    '## Acceptance Criteria',
    '',
    '| Criterion | Status | Details |',
    '| --- | --- | --- |',
    ...report.checks.map((check) =>
      `| ${markdownEscape(check.label)} | ${check.status.toUpperCase()} | ${markdownEscape(check.details)} |`
    ),
    '',
    '## Timings',
    '',
    report.timings.length > 0
      ? '| Phase | Actor | Duration ms | Status | Details |'
      : '_No timing data was collected._',
    report.timings.length > 0 ? '| --- | --- | ---: | --- | --- |' : '',
    ...report.timings.map((timing) =>
      `| ${markdownEscape(timing.phase)} | ${markdownEscape(timing.actor)} | ${timing.ms} | ${timing.status.toUpperCase()} | ${markdownEscape(timing.details || '')} |`
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
    ...relevantDiagnostics.slice(0, 30).map((diagnostic) =>
      `| ${markdownEscape(diagnostic.source)} | ${diagnostic.type} | ${diagnostic.status || ''} | ${markdownEscape(diagnostic.url || '')} | ${markdownEscape(diagnostic.message.slice(0, 500))} |`
    ),
    relevantDiagnostics.length > 30 ? `\n_Additional diagnostics omitted: ${relevantDiagnostics.length - 30}_` : '',
    '',
    '## Failure / Blockers',
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

function addDiagnostics(page: Page, source: string, report: StressReport) {
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

async function fillHostLoginIfNeeded(page: Page, email: string, password: string) {
  const emailInput = page.locator('#email');
  const isLoginVisible = await emailInput.isVisible({ timeout: 8_000 }).catch(() => false);

  if (!isLoginVisible) {
    return;
  }

  await emailInput.fill(email);
  await page.locator('#password').fill(password);
  await Promise.all([
    page.locator('#email').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined),
    page.locator('form button[type="submit"]').click(),
  ]);
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

async function waitForBodyMatch(page: Page, pattern: RegExp, timeout = 30_000): Promise<string> {
  let latest = '';
  await expect.poll(async () => {
    latest = await pageText(page);
    return pattern.test(latest);
  }, { timeout }).toBe(true);
  return latest;
}

async function waitForVisibleAnswerInput(page: Page, timeout = 60_000) {
  await page.locator('input[type="text"]').first().waitFor({ state: 'visible', timeout });
}

async function votingOptionCount(page: Page): Promise<number> {
  return page.locator('button.w-full.p-3.rounded-xl.text-right').count();
}

async function enabledVotingOptionCount(page: Page): Promise<number> {
  const options = page.locator('button.w-full.p-3.rounded-xl.text-right');
  const count = await options.count();
  let enabled = 0;
  for (let index = 0; index < count; index += 1) {
    if (await options.nth(index).isEnabled()) {
      enabled += 1;
    }
  }
  return enabled;
}

async function hasSavedVoteState(page: Page): Promise<boolean> {
  const text = await pageText(page).catch(() => '');
  const selectedCount = await page.locator('button.bg-cyan-500').count().catch(() => 0);
  return selectedCount > 0 && text.includes('تم حفظ التصويت');
}

function isCategorySelectionWaitText(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ');
  return normalized.includes('القائد يختار فئة السؤال') ||
    normalized.includes('Ø§Ù„Ù‚Ø§Ø¦Ø¯ ÙŠØ®ØªØ§Ø± ÙØ¦Ø© Ø§Ù„Ø³Ø¤Ø§Ù„') ||
    (
      (normalized.includes('الوقت المتبقي') || normalized.includes('Ø§Ù„ÙˆÙ‚Øª Ø§Ù„Ù…ØªØ¨Ù‚ÙŠ')) &&
      (normalized.includes('فئة') || normalized.includes('ÙØ¦Ø©')) &&
      (normalized.includes('الجولة') || normalized.includes('Ø§Ù„Ø¬ÙˆÙ„Ø©'))
    );
}

function startCategoryFlashWatcher(page: Page, report: StressReport): CategoryFlashWatcher {
  const events: CategoryFlashEvent[] = [];
  const startedAt = Date.now();
  let stopped = false;
  let sampling = false;

  const sample = async () => {
    if (stopped || sampling || page.isClosed()) return;
    sampling = true;

    try {
      const text = await pageText(page);
      if (!isCategorySelectionWaitText(text)) return;

      events.push({
        elapsedMs: Date.now() - startedAt,
        url: page.url(),
        textSample: text.slice(0, 500),
      });

      if (events.length === 1) {
        await captureScreenshot(report, page, 'Unexpected TV category-selection flash', 'category-flash-detected.png')
          .catch(() => undefined);
      }
    } catch {
      // Sampling should not interrupt the stress run. The final check reports any captured flash events.
    } finally {
      sampling = false;
    }
  };

  const timer = setInterval(() => {
    void sample();
  }, 250);

  return {
    events,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await sample();
      return events;
    },
  };
}

async function maybeHandleCategorySelection(controllerPage: Page) {
  const answerInputVisible = await controllerPage
    .locator('input[type="text"]')
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (answerInputVisible) {
    return;
  }

  const continueButton = controllerPage
    .locator('button.bg-gradient-to-r.from-pink-500.to-purple-500')
    .last();

  if (await continueButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await continueButton.click();
  }
}

async function closeSessions(sessions: PlayerSession[], hostContext?: BrowserContext) {
  await Promise.allSettled([
    ...sessions.map((session) => session.context.close()),
    hostContext?.close(),
  ].filter(Boolean) as Promise<void>[]);
}

async function clickConfirmationIfPresent(page: Page) {
  const dialog = page.locator('.fixed.inset-0').last();
  const confirmButton = dialog.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500');

  if (await confirmButton.isVisible({ timeout: 2_500 }).catch(() => false)) {
    await expect(dialog.getByRole('progressbar')).toBeVisible({ timeout: 2_000 });
    await confirmButton.click();
  }
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

function getSupabaseAuthConfig(): { url: string; anonKey: string; storageKey: string } {
  const url = process.env.FGSH_SUPABASE_URL || readLocalEnvValue('VITE_SUPABASE_URL');
  const anonKey = process.env.FGSH_SUPABASE_ANON_KEY || readLocalEnvValue('VITE_SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error('Missing Supabase auth config. Set FGSH_SUPABASE_URL/FGSH_SUPABASE_ANON_KEY or packages/web/.env.local.');
  }

  const projectRef = new URL(url).hostname.split('.')[0];
  return {
    url: url.replace(/\/+$/, ''),
    anonKey,
    storageKey: `sb-${projectRef}-auth-token`,
  };
}

async function authenticateHostContext(context: BrowserContext, email: string, password: string) {
  const config = getSupabaseAuthConfig();
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

test.describe(`deployed ${PLAYER_COUNT}-player stress test`, () => {
  test(`creates a room and drives ${PLAYER_COUNT} concurrent players through one round`, async () => {
    const report = createInitialReport();
    let browser: Browser | undefined;
    let hostContext: BrowserContext | undefined;
    let hostPage: Page | undefined;
    let categoryFlashWatcher: CategoryFlashWatcher | undefined;
    const sessions: PlayerSession[] = [];
    const totalStartedAt = Date.now();

    try {
      if (!Number.isInteger(PLAYER_COUNT) || PLAYER_COUNT < 2 || PLAYER_COUNT > 10) {
        const message = `FGSH_STRESS_PLAYER_COUNT must be an integer from 2 to 10. Received: ${process.env.FGSH_STRESS_PLAYER_COUNT || PLAYER_COUNT}`;
        setCheck(report, checkLabels.env, 'fail', message);
        report.blockers.push(message);
        throw new Error(message);
      }

      const missingEnv = ['FGSH_TEST_BASE_URL', 'FGSH_TEST_HOST_EMAIL', 'FGSH_TEST_HOST_PASSWORD']
        .filter((key) => !process.env[key]);

      if (missingEnv.length > 0) {
        const message = `Missing required env vars: ${missingEnv.join(', ')}`;
        setCheck(report, checkLabels.env, 'fail', message);
        report.blockers.push(message);
        throw new Error(message);
      }

      setCheck(report, checkLabels.env, 'pass', 'All required env vars are set.');

      const baseUrl = normalizeBaseUrl(process.env.FGSH_TEST_BASE_URL!);
      report.targetUrl = baseUrl;

      const executablePath = resolveBrowserExecutable();
      browser = await chromium.launch(executablePath ? { executablePath } : undefined);

      hostContext = await browser.newContext({ viewport: TV_VIEWPORT, locale: 'ar-SA' });
      await authenticateHostContext(
        hostContext,
        process.env.FGSH_TEST_HOST_EMAIL!,
        process.env.FGSH_TEST_HOST_PASSWORD!
      );
      const tvPage = await hostContext.newPage();
      hostPage = tvPage;
      addDiagnostics(tvPage, 'TV/host', report);

      const hostStartedAt = Date.now();
      await tvPage.goto(routeUrl(baseUrl, '/create'), { waitUntil: 'domcontentloaded' });
      await fillHostLoginIfNeeded(
        tvPage,
        process.env.FGSH_TEST_HOST_EMAIL!,
        process.env.FGSH_TEST_HOST_PASSWORD!
      );
      await closeStaleAuthModalIfPresent(tvPage);
      await tvPage.goto(routeUrl(baseUrl, '/create'), { waitUntil: 'domcontentloaded' });
      await closeStaleAuthModalIfPresent(tvPage);

      await Promise.all([
        tvPage.waitForURL(/\/tv\/lobby(?:\?|$)/, { timeout: 45_000 }),
        tvPage.locator('.btn-gradient.btn-pink').first().click(),
      ]);

      await expect.poll(async () => extractGameCode(tvPage), { timeout: 20_000 }).toMatch(/^[A-Z0-9]{6}$/);
      const gameCode = await extractGameCode(tvPage);
      if (!gameCode) {
        throw new Error('TV room code was not visible after room creation.');
      }

      report.gameCode = gameCode;
      report.timings.push({
        phase: 'create room',
        actor: 'host',
        ms: Date.now() - hostStartedAt,
        status: 'pass',
        details: `Created TV room ${report.gameCode}.`,
      });
      setCheck(report, checkLabels.hostRoom, 'pass', `Created TV room ${report.gameCode}.`);

      const joinPlayer = async (playerNumber: number): Promise<PlayerSession> => {
        const name = `Stress P${String(playerNumber).padStart(2, '0')}`;
        const context = await browser!.newContext({
          viewport: MOBILE_VIEWPORT,
          locale: 'ar-SA',
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        addDiagnostics(page, name, report);

        const joinedAt = Date.now();
        await page.goto(routeUrl(baseUrl, `/join?code=${report.gameCode}`), { waitUntil: 'domcontentloaded' });
        await page.locator('input[type="text"]').first().fill(name);
        await Promise.all([
          page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 45_000 }),
          page.locator('.btn-gradient.btn-pink').first().click(),
        ]);

        report.timings.push({
          phase: 'join',
          actor: name,
          ms: Date.now() - joinedAt,
          status: 'pass',
        });

        return { name, context, page };
      };

      const controller = await joinPlayer(1);
      sessions.push(controller);
      sessions.push(...await Promise.all(Array.from({ length: PLAYER_COUNT - 1 }, (_, index) => joinPlayer(index + 2))));

      setCheck(report, checkLabels.playerJoins, 'pass', `${sessions.length} players joined isolated browser contexts.`);

      await waitForBodyMatch(tvPage, new RegExp(`\\b${PLAYER_COUNT}\\s*\\/\\s*10\\b`), 45_000);
      await captureScreenshot(report, tvPage, `TV lobby with ${PLAYER_COUNT} players`, `01-tv-lobby-${PLAYER_COUNT}-players.png`);
      setCheck(report, checkLabels.tvLobbyCount, 'pass', `TV lobby displayed ${PLAYER_COUNT} / 10 players.`);

      const startStartedAt = Date.now();
      await Promise.all([
        tvPage.waitForURL(/\/tv\/game(?:\?|$)/, { timeout: 60_000 }),
        controller.page.waitForURL(/\/game(?:\?|$)/, { timeout: 60_000 }),
        controller.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click(),
      ]);

      await maybeHandleCategorySelection(controller.page);
      await Promise.all(sessions.map((session) => waitForVisibleAnswerInput(session.page)));
      categoryFlashWatcher = startCategoryFlashWatcher(tvPage, report);
      await captureScreenshot(report, tvPage, 'TV answering state', '02-tv-answering.png');
      await captureScreenshot(report, controller.page, 'Player answering state', '03-player-answering.png');
      report.timings.push({
        phase: 'start game',
        actor: controller.name,
        ms: Date.now() - startStartedAt,
        status: 'pass',
      });
      setCheck(report, checkLabels.gameStarts, 'pass', 'TV and player pages reached the first answering state.');

      const answerPlayer = async (session: PlayerSession, index: number) => {
        const startedAt = Date.now();
        const answer = `Stress answer ${index + 1} ${Date.now()}`;
        const input = session.page.locator('input[type="text"]').first();
        await input.fill(answer);
        await session.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click();
        await clickConfirmationIfPresent(session.page);
        await expect.poll(async () => {
          const inputVisible = await input.isVisible().catch(() => false);
          const optionCount = await votingOptionCount(session.page).catch(() => 0);
          return !inputVisible || optionCount > 1;
        }, { timeout: 30_000 }).toBe(true);

        report.timings.push({
          phase: 'answer',
          actor: session.name,
          ms: Date.now() - startedAt,
          status: 'pass',
        });

        return Date.now();
      };

      const answerConfirmedAt = await Promise.all(sessions.map((session, index) => answerPlayer(session, index)));
      const lastAnswerConfirmedAt = Math.max(...answerConfirmedAt);
      setCheck(report, checkLabels.answersConfirmed, 'pass', `All ${PLAYER_COUNT} player answer confirmations completed.`);

      const votingWaitStartedAt = Date.now();
      await Promise.all(sessions.map((session) =>
        expect.poll(async () => votingOptionCount(session.page), { timeout: 15_000 }).toBeGreaterThan(1)
      ));
      const answerQuorumAdvanceMs = Date.now() - lastAnswerConfirmedAt;
      report.timings.push({
        phase: 'answer quorum -> voting',
        actor: 'all',
        ms: Date.now() - votingWaitStartedAt,
        status: 'pass',
        details: `${answerQuorumAdvanceMs} ms after the last answer confirmation.`,
      });
      setCheck(
        report,
        checkLabels.answerQuorumAdvance,
        'pass',
        `Voting opened ${answerQuorumAdvanceMs} ms after the last answer confirmation.`
      );
      await captureScreenshot(report, tvPage, 'TV voting state', '04-tv-voting.png');
      await captureScreenshot(report, controller.page, 'Player voting state', '05-player-voting.png');
      setCheck(report, checkLabels.votingOpens, 'pass', `Voting options appeared for all ${PLAYER_COUNT} players.`);

      const votePlayer = async (session: PlayerSession) => {
        const startedAt = Date.now();
        const options = session.page.locator('button.w-full.p-3.rounded-xl.text-right');
        const count = await options.count();
        let clicked = false;

        for (let index = 0; index < count; index += 1) {
          const option = options.nth(index);
          if (await option.isEnabled()) {
            await option.click();
            clicked = true;
            break;
          }
        }

        if (!clicked) {
          throw new Error(`${session.name} had no enabled non-own vote option.`);
        }

        await clickConfirmationIfPresent(session.page);
        await expect.poll(async () => {
          const optionCount = await votingOptionCount(session.page).catch(() => 0);
          return optionCount === 0 || await hasSavedVoteState(session.page);
        }, { timeout: 30_000 }).toBe(true);

        report.timings.push({
          phase: 'vote',
          actor: session.name,
          ms: Date.now() - startedAt,
          status: 'pass',
        });
      };

      await Promise.all(sessions.map((session) => votePlayer(session)));
      setCheck(report, checkLabels.votesConfirmed, 'pass', `All ${PLAYER_COUNT} player vote confirmations completed.`);

      await expect.poll(async () => votingOptionCount(controller.page), { timeout: 90_000 }).toBe(0);
      await captureScreenshot(report, tvPage, 'TV completed/reveal state', '06-tv-completed-or-reveal.png');
      await captureScreenshot(report, controller.page, 'Player completed state', '07-player-completed.png');
      setCheck(report, checkLabels.roundCompleted, 'pass', 'Voting options disappeared after completion, and completed/reveal screenshots were captured.');

      const categoryFlashEvents = categoryFlashWatcher ? await categoryFlashWatcher.stop() : [];
      categoryFlashWatcher = undefined;
      setCheck(
        report,
        checkLabels.noCategoryFlash,
        categoryFlashEvents.length === 0 ? 'pass' : 'fail',
        categoryFlashEvents.length === 0
          ? 'No TV category-selection wait screen was observed after answering began.'
          : `${categoryFlashEvents.length} unexpected TV category-selection wait sample(s) observed after answering began.`
      );
      if (categoryFlashEvents.length > 0) {
        report.blockers.push('Unexpected TV category-selection wait screen appeared after answering began.');
      }

      const relevantDiagnostics = report.diagnostics.filter(isRelevantDiagnostic);
      setCheck(
        report,
        checkLabels.diagnosticsClean,
        relevantDiagnostics.length === 0 ? 'pass' : 'fail',
        relevantDiagnostics.length === 0
          ? 'No relevant runtime, page, request, or HTTP 5xx errors were captured.'
          : `${relevantDiagnostics.length} relevant diagnostic records were captured.`
      );

      report.timings.push({
        phase: 'total',
        actor: 'all',
        ms: Date.now() - totalStartedAt,
        status: relevantDiagnostics.length === 0 ? 'pass' : 'fail',
      });

      report.status = report.checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
      expect(report.status, 'stress-test acceptance status').toBe('pass');
    } catch (error) {
      if (categoryFlashWatcher) {
        const categoryFlashEvents = await categoryFlashWatcher.stop().catch(() => []);
        setCheck(
          report,
          checkLabels.noCategoryFlash,
          categoryFlashEvents.length === 0 ? 'pass' : 'fail',
          categoryFlashEvents.length === 0
            ? 'No TV category-selection wait screen was observed after answering began before failure.'
            : `${categoryFlashEvents.length} unexpected TV category-selection wait sample(s) observed before failure.`
        );
      }

      report.status = 'fail';
      const message = error instanceof Error ? error.message : String(error);
      if (!report.blockers.includes(message)) {
        report.blockers.push(message);
      }

      if (hostPage && !hostPage.isClosed()) {
        await captureScreenshot(report, hostPage, 'Failure state - TV/host', 'failure-tv-host.png').catch(() => undefined);
      }

      for (const session of sessions.slice(0, 2)) {
        if (!session.page.isClosed()) {
          await captureScreenshot(
            report,
            session.page,
            `Failure state - ${session.name}`,
            `failure-${session.name.toLowerCase().replace(/\s+/g, '-')}.png`
          ).catch(() => undefined);
        }
      }

      report.timings.push({
        phase: 'total',
        actor: 'all',
        ms: Date.now() - totalStartedAt,
        status: 'fail',
        details: message,
      });
      throw error;
    } finally {
      report.completedAt = new Date().toISOString();
      await writeReport(report);
      await closeSessions(sessions, hostContext);
      await browser?.close();
    }
  });
});
