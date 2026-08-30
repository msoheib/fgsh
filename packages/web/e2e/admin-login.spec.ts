import { expect, test, type Page } from '@playwright/test';

// Keep these auth/navigation tests isolated from production accounts and data.
async function mockAuth(page: Page, baseURL: string, profile = {
  is_admin: true,
  is_approved: true,
}, profileError = false) {
  const origin = new URL(baseURL).origin;
  if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) {
    throw new Error('Admin login tests must run against a local server.');
  }
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@example.invalid',
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { display_name: 'Test Admin' },
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt,
  })}.test-signature`;
  const requests = { questionReads: 0, unexpected: [] as string[] };

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'fonts.googleapis.com') {
      return route.fulfill({ contentType: 'text/css', body: '' });
    }
    const respond = (json: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': origin },
      body: JSON.stringify(json),
    });
    if (url.pathname === '/auth/v1/token') {
      if (route.request().postDataJSON().password !== 'test-password') {
        return respond({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
      }
      return respond({
        access_token: token,
        refresh_token: 'local-test-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        user,
      });
    }
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/host_profiles') {
      return profileError ? respond({ message: 'Profile unavailable' }, 403) : respond(profile);
    }
    if (url.pathname === '/rest/v1/questions') {
      requests.questionReads += 1;
      return respond([]);
    }
    requests.unexpected.push(url.origin + url.pathname);
    return route.abort();
  });
  return requests;
}

async function signIn(page: Page, password = 'test-password') {
  await page.getByLabel('البريد الإلكتروني', { exact: true }).fill('admin@example.invalid');
  await page.getByLabel('كلمة المرور', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'تسجيل الدخول', exact: true }).click();
}

test.use({
  launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 375, height: 667 },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('homepage sign-in restores the menu and dashboard, logout restores sign-in', async ({ page, baseURL }, testInfo) => {
      const requests = await mockAuth(page, baseURL!);
      await page.goto('/');
      const login = page.getByRole('button', { name: 'تسجيل الدخول', exact: true });
      await expect(login).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('homepage-login.png'), fullPage: true });
      await login.click();
      await expect(page.locator('input[type="email"]')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('homepage-login-modal.png'), fullPage: true });
      await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
      await expect(page.locator('input[type="email"]')).toHaveCount(0);
      await expect(page).toHaveURL(baseURL! + '/');
      await login.click();
      await signIn(page);
      await page.getByRole('button', { name: 'قائمة المستخدم', exact: true }).click();
      await page.getByRole('button', { name: 'لوحة الإدارة', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'لوحة الإدارة', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'تسجيل الخروج', exact: true }).click();
      await expect(page).toHaveURL(baseURL! + '/');
      await expect(login).toBeVisible();
      await expect(page.getByRole('button', { name: 'قائمة المستخدم', exact: true })).toHaveCount(0);
      expect(requests.questionReads).toBeGreaterThan(0);
      expect(requests.unexpected).toEqual([]);
    });

    test('direct admin login keeps its URL through failed login, retry and reload', async ({ page, baseURL }, testInfo) => {
      await mockAuth(page, baseURL!);
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: 'تسجيل الدخول', exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('admin-login.png'), fullPage: true });
      await signIn(page, 'wrong-password');
      await expect(page.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة', { exact: true })).toBeVisible();
      await expect(page).toHaveURL(baseURL! + '/admin');
      await expect(page.getByLabel('البريد الإلكتروني', { exact: true })).toHaveValue('admin@example.invalid');
      await expect(page.getByLabel('كلمة المرور', { exact: true })).toHaveValue('wrong-password');
      await signIn(page);
      await expect(page.getByRole('heading', { name: 'لوحة الإدارة', exact: true })).toBeVisible();
      await expect(page).toHaveURL(baseURL! + '/admin');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'لوحة الإدارة', exact: true })).toBeVisible();
      await expect(page).toHaveURL(baseURL! + '/admin');
    });

    for (const scenario of [
      { name: 'ordinary user', is_admin: false, is_approved: true, heading: 'غير مصرح', profileError: false },
      { name: 'unapproved admin', is_admin: true, is_approved: false, heading: 'في انتظار الموافقة', profileError: false },
      { name: 'unavailable permissions', is_admin: true, is_approved: true, heading: 'غير مصرح', profileError: true },
    ]) {
      test(`admin stays protected for ${scenario.name}`, async ({ page, baseURL }) => {
        const requests = await mockAuth(page, baseURL!, scenario, scenario.profileError);
        await page.goto('/admin');
        await signIn(page);
        await expect(page.getByRole('heading', { name: scenario.heading, exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'لوحة الإدارة', exact: true })).toHaveCount(0);
        expect(requests.questionReads).toBe(0);
        expect(requests.unexpected).toEqual([]);
      });
    }
  });
}
