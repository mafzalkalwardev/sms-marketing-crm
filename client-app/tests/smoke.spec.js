const { test, expect } = require('@playwright/test');

test('logs in and opens the inbox', async ({ page }) => {
  await page.goto('/?login=1');
  await page.getByLabel('Email').fill('user1@demo.local');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible({ timeout: 20000 });
});
