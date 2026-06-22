const { test, expect } = require('@playwright/test');

test('registers and sends a mock SMS from the dialer', async ({ page }) => {
  const stamp = Date.now();
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5050';
  await page.goto('/');
  await page.getByRole('button', { name: 'Register' }).click();
  await page.getByLabel('Name').fill('Frontend Smoke');
  await page.getByLabel('Email').fill(`frontend-smoke-${stamp}@example.com`);
  await page.getByLabel('Password').fill('SmokeTest123!');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('token'));
  const addNumber = await page.request.post(`${apiBase}/api/numbers`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { phone_number: `+1777${String(stamp).slice(-7)}`, country: 'US', type: 'long-code', label: 'Smoke sender', is_default: true },
  });
  expect(addNumber.ok()).toBeTruthy();

  await page.getByRole('button', { name: 'Dialpad / New Text' }).click();
  await expect(page.getByRole('heading', { name: 'Dialpad / New Text' })).toBeVisible();
  await page.getByLabel('Recipient').fill(`+1555${String(stamp).slice(-7)}`);
  await page.getByPlaceholder('Type a text message...').fill('Frontend smoke SMS. Reply STOP to opt out.');
  await page.getByRole('button', { name: 'Send text' }).click();
  await expect(page.getByText('Mock SMS sent')).toBeVisible();

  await page.getByRole('button', { name: 'Messages' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
});

test('admin can view masked Vonage provider status', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@ftsolutions.local');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Login to workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();

  await page.getByRole('button', { name: 'Admin Console' }).click();
  await expect(page.getByRole('heading', { name: 'Admin Console' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vonage' })).toBeVisible();
  await expect(page.getByText('Signature secret')).toBeVisible();
  await page.getByRole('button', { name: 'Test provider' }).click();
  await expect(page.getByText(/Provider check:/)).toBeVisible();
  await page.getByLabel('Recipient').fill('+15551230099');
  await page.getByRole('button', { name: 'Send test SMS' }).click();
  await expect(page.getByText(/Test completed in mock mode|Live test sent/)).toBeVisible();
});
