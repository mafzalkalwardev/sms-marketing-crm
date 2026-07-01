const { test, expect } = require('@playwright/test');

test('registers and sends a mock SMS from the dialer', async ({ page }) => {
  const stamp = Date.now();
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Your name').fill('Frontend Smoke');
  await page.getByLabel('Email').fill(`frontend-smoke-${stamp}@example.com`);
  await page.getByLabel('Password').fill('SmokeTest123!');
  await page.getByRole('button', { name: 'Create account' }).click();
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
  await expect(page.getByText(/Sent ·/)).toBeVisible();

  await page.getByRole('button', { name: 'Messages' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
});

test('admin can open team admin console', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@ftsolutions.local');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();

  await page.getByRole('button', { name: 'Team admin' }).click();
  await expect(page.getByRole('heading', { name: 'Team admin' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Users' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Branding' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'API keys' })).toBeVisible();
});
