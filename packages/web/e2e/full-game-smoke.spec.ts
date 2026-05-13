import { expect, test, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYER_COUNT = Number.parseInt(process.env.FGSH_FULL_GAME_PLAYER_COUNT || '2', 10);
const ROUND_COUNT = Number.parseInt(process.env.FGSH_FULL_GAME_ROUND_COUNT || '7', 10);
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TV_VIEWPORT = { width: 1440, height: 900 };
const REPORT_DATE = process.env.FGSH_FULL_GAME_REPORT_DATE || '2026-05-13';

interface PlayerSession {
  name: string;
  context: BrowserContext;
  page: Page;
}

interface RoundTiming {
  round: number;
  answerQuorumToVotingMs: number;
  voteQuorumToCompletedMs: number;
}

const testFilePath = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(testFilePath), '..');
const repoRoot = path.resolve(webRoot, '../..');
const reportDir = path.join(repoRoot, 'qa-reports', `full-game-smoke-${REPORT_DATE}`);
const reportPath = path.join(reportDir, 'full-game-smoke.md');
const localEnvPath = path.join(webRoot, '.env.local');
const browserExecutableCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((candidate): candidate is string => !!candidate);

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

async function waitForAnsweringOrHandleCategorySelection(controllerPage: Page) {
  let latestText = '';
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const input = controllerPage.locator('input[type="text"]').first();
    if (await input.isVisible().catch(() => false)) {
      return;
    }

    latestText = await pageText(controllerPage).catch(() => '');
    if (latestText.includes('اختر فئة السؤال') || latestText.includes('اختيار الفئة')) {
      const continueButton = controllerPage.getByRole('button', { name: /متابعة/ }).last();
      await expect(continueButton).toBeEnabled({ timeout: 10_000 });
      await continueButton.click();
      await waitForVisibleAnswerInput(controllerPage, 60_000);
      return;
    }

    await controllerPage.waitForTimeout(250);
  }

  throw new Error(`Controller did not reach answering/category state. Text: ${latestText.slice(0, 300)}`);
}

async function clickConfirmationIfPresent(page: Page) {
  const dialog = page.locator('.fixed.inset-0').last();
  const confirmButton = dialog.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500');

  if (await confirmButton.isVisible({ timeout: 2_500 }).catch(() => false)) {
    await expect(dialog.getByRole('progressbar')).toBeVisible({ timeout: 2_000 });
    await confirmButton.click();
  }
}

async function closeSessions(sessions: PlayerSession[], hostContext?: BrowserContext) {
  await Promise.allSettled([
    ...sessions.map((session) => session.context.close()),
    hostContext?.close(),
  ].filter(Boolean) as Promise<void>[]);
}

function addDiagnostics(page: Page, source: string, diagnostics: string[]) {
  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    diagnostics.push(`${source} console ${message.type()}: ${message.text()}`);
  });

  page.on('pageerror', (error) => {
    diagnostics.push(`${source} pageerror: ${error.message}`);
  });
}

async function writeReport(input: {
  targetUrl: string;
  gameCode: string;
  startedAt: string;
  completedAt: string;
  timings: RoundTiming[];
}) {
  await fs.mkdir(reportDir, { recursive: true });
  const lines = [
    '# Full Game Smoke Report',
    '',
    '- Status: **PASS**',
    `- Target URL: ${input.targetUrl}`,
    `- Game code: ${input.gameCode}`,
    `- Started: ${input.startedAt}`,
    `- Completed: ${input.completedAt}`,
    `- Players: ${PLAYER_COUNT}`,
    `- Rounds completed: ${ROUND_COUNT}`,
    '- Credentials: supplied through environment variables and intentionally not logged.',
    '',
    '## Round Progression',
    '',
    '| Round | Answer quorum to voting ms | Vote quorum to completed ms |',
    '| ---: | ---: | ---: |',
    ...input.timings.map((timing) =>
      `| ${timing.round} | ${timing.answerQuorumToVotingMs} | ${timing.voteQuorumToCompletedMs} |`
    ),
    '',
  ];

  await fs.writeFile(reportPath, lines.join('\n'), 'utf8');
}

test.describe('deployed full-game smoke test', () => {
  test('drives players through every round and reaches results', async () => {
    test.setTimeout(720_000);

    const missingEnv = ['FGSH_TEST_BASE_URL', 'FGSH_TEST_HOST_EMAIL', 'FGSH_TEST_HOST_PASSWORD']
      .filter((key) => !process.env[key]);

    if (missingEnv.length > 0) {
      throw new Error(`Missing required env vars: ${missingEnv.join(', ')}`);
    }

    const baseUrl = normalizeBaseUrl(process.env.FGSH_TEST_BASE_URL!);
    const startedAt = new Date().toISOString();
    const timings: RoundTiming[] = [];
    const diagnostics: string[] = [];
    let browser: Browser | undefined;
    let hostContext: BrowserContext | undefined;
    const sessions: PlayerSession[] = [];
    let gameCode = '';

    try {
      const executablePath = resolveBrowserExecutable();
      browser = await chromium.launch(executablePath ? { executablePath } : undefined);

      hostContext = await browser.newContext({ viewport: TV_VIEWPORT, locale: 'ar-SA' });
      await authenticateHostContext(
        hostContext,
        process.env.FGSH_TEST_HOST_EMAIL!,
        process.env.FGSH_TEST_HOST_PASSWORD!
      );
      const tvPage = await hostContext.newPage();
      addDiagnostics(tvPage, 'TV', diagnostics);

      await tvPage.goto(routeUrl(baseUrl, '/create'), { waitUntil: 'domcontentloaded' });
      await closeStaleAuthModalIfPresent(tvPage);
      await tvPage.goto(routeUrl(baseUrl, '/create'), { waitUntil: 'domcontentloaded' });
      await closeStaleAuthModalIfPresent(tvPage);

      await Promise.all([
        tvPage.waitForURL(/\/tv\/lobby(?:\?|$)/, { timeout: 45_000 }),
        tvPage.locator('.btn-gradient.btn-pink').first().click(),
      ]);

      await expect.poll(async () => extractGameCode(tvPage), { timeout: 20_000 }).toMatch(/^[A-Z0-9]{6}$/);
      gameCode = await extractGameCode(tvPage) || '';

      const joinPlayer = async (playerNumber: number): Promise<PlayerSession> => {
        const name = `Full P${String(playerNumber).padStart(2, '0')}`;
        const context = await browser!.newContext({
          viewport: MOBILE_VIEWPORT,
          locale: 'ar-SA',
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        addDiagnostics(page, name, diagnostics);

        await page.goto(routeUrl(baseUrl, `/join?code=${gameCode}`), { waitUntil: 'domcontentloaded' });
        await page.locator('input[type="text"]').first().fill(name);
        await Promise.all([
          page.waitForURL(/\/lobby(?:\?|$)/, { timeout: 45_000 }),
          page.locator('.btn-gradient.btn-pink').first().click(),
        ]);

        return { name, context, page };
      };

      const controller = await joinPlayer(1);
      sessions.push(controller);
      sessions.push(...await Promise.all(Array.from({ length: PLAYER_COUNT - 1 }, (_, index) => joinPlayer(index + 2))));

      await waitForBodyMatch(tvPage, new RegExp(`\\b${PLAYER_COUNT}\\s*\\/\\s*10\\b`), 45_000);
      await Promise.all([
        tvPage.waitForURL(/\/tv\/game(?:\?|$)/, { timeout: 60_000 }),
        controller.page.waitForURL(/\/game(?:\?|$)/, { timeout: 60_000 }),
        controller.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click(),
      ]);

      for (let round = 1; round <= ROUND_COUNT; round += 1) {
        await waitForAnsweringOrHandleCategorySelection(controller.page);
        for (const session of sessions) {
          try {
            await waitForVisibleAnswerInput(session.page);
          } catch (error) {
            const text = await pageText(session.page).catch(() => '');
            throw new Error(
              `Round ${round}: ${session.name} did not reach answering. URL: ${session.page.url()}. Text: ${text.slice(0, 500)}. Diagnostics: ${diagnostics.slice(-20).join(' | ')}`
            );
          }
        }

        const answerConfirmedAt = await Promise.all(sessions.map(async (session, index) => {
          const input = session.page.locator('input[type="text"]').first();
          await input.fill(`Full game R${round} P${index + 1} ${Date.now()}`);
          await session.page.locator('button.bg-gradient-to-r.from-pink-500.to-purple-500').first().click();
          await clickConfirmationIfPresent(session.page);
          await expect.poll(async () => {
            const inputVisible = await input.isVisible().catch(() => false);
            const optionCount = await votingOptionCount(session.page).catch(() => 0);
            return !inputVisible || optionCount > 1;
          }, { timeout: 30_000 }).toBe(true);
          return Date.now();
        }));

        const lastAnswerConfirmedAt = Math.max(...answerConfirmedAt);
        await Promise.all(sessions.map((session) =>
          expect.poll(async () => votingOptionCount(session.page), { timeout: 15_000 }).toBeGreaterThan(1)
        ));
        const answerQuorumToVotingMs = Date.now() - lastAnswerConfirmedAt;

        const voteConfirmedAt = await Promise.all(sessions.map(async (session) => {
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
            throw new Error(`${session.name} had no enabled vote option in round ${round}.`);
          }

          await clickConfirmationIfPresent(session.page);
          return Date.now();
        }));

        const lastVoteConfirmedAt = Math.max(...voteConfirmedAt);
        await expect.poll(async () => votingOptionCount(controller.page), { timeout: 20_000 }).toBe(0);
        const voteQuorumToCompletedMs = Date.now() - lastVoteConfirmedAt;

        timings.push({
          round,
          answerQuorumToVotingMs,
          voteQuorumToCompletedMs,
        });

        if (round < ROUND_COUNT) {
          const nextButton = controller.page
            .locator('button.bg-gradient-to-r.from-pink-500.to-purple-500')
            .first();
          await expect.poll(async () => nextButton.isEnabled().catch(() => false), { timeout: 90_000 }).toBe(true);
          await nextButton.click();
        }
      }

      const resultsButton = controller.page
        .locator('button.bg-gradient-to-r.from-pink-500.to-purple-500')
        .first();
      await expect.poll(async () => resultsButton.isEnabled().catch(() => false), { timeout: 90_000 }).toBe(true);
      await Promise.all([
        controller.page.waitForURL(/\/results(?:\?|$)/, { timeout: 30_000 }),
        resultsButton.click(),
      ]);

      await writeReport({
        targetUrl: baseUrl,
        gameCode,
        startedAt,
        completedAt: new Date().toISOString(),
        timings,
      });
    } finally {
      await closeSessions(sessions, hostContext);
      await browser?.close();
    }
  });
});
