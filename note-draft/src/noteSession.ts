import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { AUTH_STATE_PATH, STORAGE_DIR } from './paths.js';
import { URLS, loggedInMarkers } from './selectors.js';
import { logger } from './logger.js';
import type { RuntimeOptions } from './config.js';

/**
 * ログイン状態の保存・読み込み・判定を担当（依頼書 §13.4）。
 * 保存するのは Playwright の storageState（Cookie等）だけで、
 * パスワードは受け取らない・保存しない・ログに出さない。
 */

export function hasSavedAuth(): boolean {
  return existsSync(AUTH_STATE_PATH);
}

async function anyVisible(locators: ReturnType<typeof loggedInMarkers>): Promise<boolean> {
  for (const loc of locators) {
    try {
      if (await loc.first().isVisible({ timeout: 1500 })) return true;
    } catch {
      /* 次の候補へ */
    }
  }
  return false;
}

/** 現在のページがログイン済みかを判定 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  return anyVisible(loggedInMarkers(page));
}

/**
 * 「実際にエディタ(/notes/new)を開けるか」でログインを確定判定する。
 * 未ログインだと note は /login へリダイレクトするので、その事実を真実の目印にする。
 * （マーカーやcookie名の推測に頼らないので誤検知しない）
 */
export async function canOpenEditor(page: Page): Promise<boolean> {
  await page.goto(URLS.newNote, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  return !/\/login|\/signup/.test(page.url());
}

/**
 * login コマンド：ブラウザを headed で開き、ユーザーが手動ログイン。
 * ユーザーが /login を離れたのを見てから、エディタを開けるか確認して確定する。
 * 確定できるまで保存しない（未ログイン状態を誤って保存しない）。
 */
export async function runLogin(timeoutMs = 10 * 60 * 1000): Promise<void> {
  if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(URLS.login, { waitUntil: 'domcontentloaded' });

  console.log('\nブラウザを開きました。');
  console.log('noteに手動でログインしてください（メール/パスワード や Google/Apple 等）。');
  console.log('ログインが完了すると自動で確認し、保存してブラウザを閉じます。');
  console.log('パスワードは保存しません。ログイン済みの状態だけを storage/note-auth.json に保存します。\n');

  const start = Date.now();
  let confirmed = false;
  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(4000);
    const url = page.url();
    const stillOnLogin = /\/login|\/signup/.test(url);
    if (stillOnLogin) continue; // まだログイン画面。ユーザーの操作を待つ。

    // /login を離れた → 本当にログインできたかをエディタで確定
    if (await canOpenEditor(page).catch(() => false)) {
      confirmed = true;
      break;
    }
    // 開けなかった（=まだ未ログイン）。ログイン画面へ戻して待機継続。
    await page.goto(URLS.login, { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  if (!confirmed) {
    logger.error('時間内にログインを確認できませんでした。保存しません。もう一度 `npm run login` を実行してください。');
    await browser.close();
    return;
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  logger.info('ログインを確認し、状態を storage/note-auth.json に保存しました。');
  await browser.close();
}

/**
 * 保存済みログイン状態で context を開く。draft/verify で使う。
 */
export async function openAuthedContext(
  opts: RuntimeOptions,
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!hasSavedAuth()) {
    throw new Error('保存済みログイン状態がありません。先に `npm run login` を実行してください。');
  }
  const browser = await chromium.launch({ headless: !opts.headed, slowMo: opts.slowMo });
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH });
  const page = await context.newPage();
  return { browser, context, page };
}
