const { test, expect } = require('@playwright/test');

test('logs in and sends a mock SMS from the dialer', async ({ page }) => {
  const stamp = Date.now();
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  await page.goto('/');
  await page.getByLabel('Email').fill('user1@demo.local');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('token'));
  const addNumber = await page.request.post(`${apiBase}/api/numbers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      phone_number: `+1777${String(stamp).slice(-7)}`,
      country: 'US',
      type: 'long-code',
      label: 'Smoke sender',
      is_default: true,
    },
  });
  expect(addNumber.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'New text', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New text' })).toBeVisible();
  await page.getByLabel('Recipient').fill(`+1555${String(stamp).slice(-7)}`);
  await page.getByPlaceholder('Type a text message...').fill('Frontend smoke SMS. Reply STOP to opt out.');
  await page.getByRole('button', { name: 'Send text' }).click();
  await expect(page.getByText('Frontend smoke SMS')).toBeVisible({ timeout: 15000 });
});
