const { test, expect } = require('@playwright/test');

test('registers and sends a mock SMS from the dialer', async ({ page }) => {
  const stamp = Date.now();
  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByLabel('Name').fill('Frontend Smoke');
  await page.getByLabel('Email').fill(`frontend-smoke-${stamp}@example.com`);
  await page.getByLabel('Password').fill('SmokeTest123!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.getByRole('button', { name: 'Manual SMS' }).click();
  await expect(page.getByRole('heading', { name: 'Manual SMS' })).toBeVisible();
  await page.getByLabel('Recipient').fill(`+1555${String(stamp).slice(-7)}`);
  await page.getByPlaceholder('Type a text message...').fill('Frontend smoke SMS. Reply STOP to opt out.');
  await page.getByRole('button', { name: 'Send SMS' }).click();
  await expect(page.getByText('Mock SMS sent')).toBeVisible();

  await page.getByRole('button', { name: 'Inbox' }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
});
