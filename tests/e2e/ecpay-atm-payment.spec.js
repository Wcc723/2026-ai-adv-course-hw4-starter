const { test, expect } = require('@playwright/test');

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@hexschool.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '12345678';

async function clickFirstVisible(candidates, description, timeout = 15000) {
  for (const candidate of candidates) {
    try {
      const target = candidate.first();
      await target.waitFor({ state: 'visible', timeout: Math.min(timeout, 5000) });
      await target.click();
      return;
    } catch (_) {
      // ECPay staging changes its markup occasionally; try the next semantic locator.
    }
  }
  throw new Error(`找不到可操作的「${description}」元素`);
}

async function clearMemberCart(request, baseURL, token) {
  const headers = { Authorization: `Bearer ${token}` };
  const cartResponse = await request.get(`${baseURL}/api/cart`, { headers });
  expect(cartResponse.ok()).toBeTruthy();
  const cart = await cartResponse.json();

  for (const item of cart.data.items) {
    const response = await request.delete(`${baseURL}/api/cart/${item.id}`, { headers });
    expect(response.ok()).toBeTruthy();
  }
}

async function chooseAtmPayment(page) {
  await clickFirstVisible(
    [
      page.getByRole('radio', { name: /網路\s*ATM/i }),
      page.getByText(/網路\s*ATM/i, { exact: true }),
      page.locator('label').filter({ hasText: /網路\s*ATM/i }),
      page.locator('input[value="ATM"]'),
    ],
    '網路 ATM'
  );

  const bankSelect = page.getByRole('combobox').first();
  await bankSelect.selectOption({ label: '台灣土地銀行' });
  await expect(bankSelect.locator('option:checked')).toHaveText('台灣土地銀行');
}

async function closeStageNotice(page) {
  const closeButtons = [
    page.getByRole('button', { name: /^關閉$/ }),
    page.getByRole('button', { name: /^確定$/ }),
    page.getByRole('button', { name: /我知道了|Close/i }),
    page.locator('.modal:visible, [role="dialog"]:visible').getByText(/關閉|確定|Close/i),
  ];

  for (const button of closeButtons) {
    try {
      if (await button.first().isVisible({ timeout: 1500 })) {
        await button.first().click();
        return;
      }
    } catch (_) {
      // A native browser dialog is handled by the dialog listener instead.
    }
  }
}

async function waitForPaidOrder(page, request, baseURL, token, orderId, testInfo) {
  const headers = { Authorization: `Bearer ${token}` };

  await expect.poll(
    async () => {
      const response = await request.get(`${baseURL}/api/orders/${orderId}`, { headers });
      if (!response.ok()) return `HTTP ${response.status()}`;
      const body = await response.json();
      return body.data.status;
    },
    {
      message: '等待訂單 API 狀態變為 paid',
      timeout: 90000,
      intervals: [1000, 2000, 3000, 5000],
    }
  ).toBe('paid');

  await page.goto(`/orders/${orderId}?payment=success`);
  await expect(page.getByText('已付款', { exact: true })).toBeVisible();
  await expect(page.getByText('付款成功！感謝您的購買。')).toBeVisible();

  const finalResponse = await request.get(`${baseURL}/api/orders/${orderId}`, { headers });
  expect(finalResponse.ok()).toBeTruthy();
  const finalOrder = await finalResponse.json();
  expect(finalOrder).toMatchObject({
    error: null,
    data: {
      id: orderId,
      status: 'paid',
    },
  });

  const returnSuccessScreenshot = testInfo.outputPath('payment-return-success.png');
  await page.screenshot({ path: returnSuccessScreenshot, fullPage: true });
  await testInfo.attach('返回站點付款成功', {
    path: returnSuccessScreenshot,
    contentType: 'image/png',
  });
}

test('從商店結帳並完成綠界網路 ATM 付款', async ({ page, request, baseURL, context }, testInfo) => {
  test.slow();

  let token;
  let orderId;

  await test.step('登入花卉電商', async () => {
    await page.goto('/login');
    await page.getByPlaceholder('請輸入 Email').fill(ADMIN_EMAIL);
    await page.getByPlaceholder('請輸入密碼').fill(ADMIN_PASSWORD);

    const loginResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'
    );
    await page.locator('form').getByRole('button', { name: '登入', exact: true }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    await expect(page).toHaveURL(`${baseURL}/`);
    token = await page.evaluate(() => localStorage.getItem('flower_token'));
    expect(token).toBeTruthy();
  });

  await test.step('選擇有庫存商品並加入購物車', async () => {
    await clearMemberCart(request, baseURL, token);

    await page.goto('/');
    const addButton = page.getByRole('button', { name: '加入購物車', exact: true }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    await expect(page.getByText('已加入購物車')).toBeVisible();
  });

  await test.step('進入結帳並建立含配送資訊的訂單', async () => {
    await page.goto('/cart');
    await expect(page.getByRole('button', { name: '前往結帳', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '前往結帳', exact: true }).click();
    await expect(page).toHaveURL(`${baseURL}/checkout`);

    await page.getByPlaceholder('請輸入收件人姓名').fill('Playwright 測試收件人');
    await page.getByPlaceholder('請輸入 Email').fill('admin@hexschool.com');
    await page.getByPlaceholder('請輸入收件地址').fill('台北市信義區測試路 1 號');
    await page.getByRole('radio', { name: /宅配/ }).check();

    const orderResponsePromise = page.waitForResponse(
      (response) => response.url().endsWith('/api/orders') && response.request().method() === 'POST'
    );
    const paymentPageRequestPromise = page.waitForRequest(
      (request) => /\/ecpay\/payment\/[^/]+$/.test(new URL(request.url()).pathname)
    );
    await page.getByRole('button', { name: '確認送出訂單', exact: true }).click();
    const orderResponse = await orderResponsePromise;
    expect(orderResponse.status()).toBe(201);
    const paymentPageRequest = await paymentPageRequestPromise;
    orderId = new URL(paymentPageRequest.url()).pathname.split('/').pop();

    const detailResponse = await request.get(`${baseURL}/api/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(detailResponse.ok()).toBeTruthy();
    const orderBody = await detailResponse.json();
    expect(orderBody).toMatchObject({ error: null, data: { shipping_method: 'home_delivery' } });
    expect(orderBody.data.shipping_fee).toBeGreaterThanOrEqual(0);
    expect(orderBody.data.total_amount).toBe(orderBody.data.subtotal + orderBody.data.shipping_fee);
  });

  await test.step('於綠界測試環境完成網路 ATM 付款', async () => {
    await page.waitForURL(/payment-stage\.ecpay\.com\.tw/i, { timeout: 60000 });
    await chooseAtmPayment(page);

    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    const popupPromise = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
    await clickFirstVisible(
      [
        page.getByRole('link', { name: /前往付款/ }),
        page.getByRole('button', { name: /前往付款/ }),
        page.getByText(/前往付款/, { exact: true }),
        page.locator('input[type="submit"][value*="付款"]'),
      ],
      '前往付款'
    );
    await closeStageNotice(page);

    const popup = await popupPromise;
    const bankPage = popup || page;
    await bankPage.waitForLoadState('domcontentloaded');
    await bankPage.bringToFront();

    await clickFirstVisible(
      [
        bankPage.getByRole('button', { name: /^Save$/i }),
        bankPage.getByText(/^Save$/i),
        bankPage.locator('input[type="submit"][value="Save"]'),
        bankPage.locator('input[type="button"][value="Save"]'),
      ],
      'Save',
      30000
    );

    await expect(bankPage.getByText(/付款成功|交易成功/).first()).toBeVisible({ timeout: 60000 });
    const paymentSuccessScreenshot = testInfo.outputPath('ecpay-payment-success.png');
    await bankPage.screenshot({ path: paymentSuccessScreenshot, fullPage: true });
    await testInfo.attach('綠界付款成功', {
      path: paymentSuccessScreenshot,
      contentType: 'image/png',
    });

    await clickFirstVisible(
      [
        bankPage.getByRole('link', { name: /返回商店/ }),
        bankPage.getByRole('button', { name: /返回商店/ }),
        bankPage.getByText(/返回商店/, { exact: true }),
      ],
      '返回商店',
      30000
    );

    if (bankPage !== page) {
      await page.bringToFront();
    }
  });

  await test.step('驗證訂單已付款且 API 狀態為 paid', async () => {
    await waitForPaidOrder(page, request, baseURL, token, orderId, testInfo);
  });
});
