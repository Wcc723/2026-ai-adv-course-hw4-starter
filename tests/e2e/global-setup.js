module.exports = async function globalSetup(config) {
  const baseURL = config.projects[0].use.baseURL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(baseURL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `E2E 所需伺服器未就緒：${baseURL}。請先另行啟動專案，再執行 npm run test:e2e。\n${error.message}`
    );
  } finally {
    clearTimeout(timeout);
  }
};
