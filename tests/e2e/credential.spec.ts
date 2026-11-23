import { expect, test } from '@playwright/test';

const login = process.env.AURASEAL_TEST_LOGIN ?? 'demo-issuer';
const password = process.env.AURASEAL_TEST_PASSWORD ?? 'synthetic-test-password-local';

test('TEST-10 organizer approval to download, verify, share and revoke with mobile reduced motion', async ({ page, browser, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Give achievements a life of their own.' })).toBeVisible();
  await page.getByRole('button', { name: 'Play motion' }).click();
  await expect(page.getByRole('button', { name: 'Pause motion' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause motion' }).click();
  await page.getByLabel('Username').fill(login);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Open workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Issuance studio' })).toBeVisible();
  const create = page.getByRole('button', { name: 'New event' });
  if (await create.isVisible()) await create.click();
  await page.getByLabel('Event name').fill('Nova Build Sprint ' + Date.now());
  await page.getByLabel('Event date').fill('2026-11-24');
  await page.getByLabel('I’m authorized', { exact: false }).check();
  await page.getByRole('button', { name: 'Create event' }).click();
  await page.getByLabel('Results file').setInputFiles('tests/fixtures/demo.csv');
  await page.getByRole('button', { name: 'Validate results' }).click();
  await expect(page.getByText('4 valid', { exact: true })).toBeVisible();
  await page.getByLabel('Preview recipient').selectOption('3');
  await expect(page.getByText('Template · Daybreak')).toBeVisible();
  await page.getByRole('button', { name: 'Generate proposal' }).click();
  await expect(page.getByText('Awaiting organizer approval.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and issue' })).toBeDisabled();
  await page.getByLabel('I approve issuance', { exact: false }).check();
  await page.getByRole('button', { name: 'Approve and issue' }).click();
  await expect(page.getByText('4 of 4 exports ready')).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true });

  const publicLink = await page.getByRole('link', { name: 'Maya Chen' }).getAttribute('href');
  if (!baseURL || !publicLink) throw new Error('Test requires a configured public origin and an issued link');
  const mobile = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, reducedMotion: 'reduce' });
  const recipient = await mobile.newPage();
  await recipient.goto(publicLink);
  await expect(recipient.getByText('Verified credential')).toBeVisible();
  await expect(recipient.getByRole('heading', { name: 'Maya Chen' })).toBeVisible();
  await expect(recipient.getByRole('button', { name: 'Play motion' })).toHaveCount(0);
  await expect(recipient.getByRole('link', { name: 'Share on LinkedIn' })).toHaveAttribute('href',
    'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(baseURL + publicLink));
  const [download] = await Promise.all([recipient.waitForEvent('download'), recipient.getByRole('link', { name: 'Download MP4' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^AuraSeal-[a-f0-9]+\.mp4$/);
  await recipient.screenshot({ path: 'test-results/recipient-mobile.png', fullPage: true });
  const first = page.locator('.batch-list li').filter({ hasText: 'Maya Chen' });
  await first.getByRole('button', { name: 'Revoke' }).click();
  await first.getByLabel('Revocation reason').fill('Synthetic browser test');
  await first.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(first.getByText('revoked', { exact: true })).toBeVisible();
  await recipient.reload();
  await expect(recipient.getByRole('heading', { name: 'Credential revoked' })).toBeVisible();
  await mobile.close();
  expect(errors).toEqual([]);
});

test('TEST-11 unauthenticated mutations and asset access are denied', async ({ request, baseURL }) => {
  expect((await request.post('/api/events', { headers: { origin: baseURL! }, data: {} })).status()).toBe(401);
  expect((await request.post('/api/session', { headers: { origin: 'https://untrusted.invalid' }, data: {} })).status()).toBe(403);
  const verification = await request.get('/api/verify/' + '0'.repeat(32));
  expect(verification.status()).toBe(404);
  expect(await verification.json()).toEqual({ status: 'invalid' });
  expect((await request.get('/api/verify/' + '0'.repeat(32) + '/download/mp4')).status()).toBe(404);
});
