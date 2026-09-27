import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parseArticle } from './articleParser.js';
import { validateArticle } from './articleValidator.js';
import { runLogin, hasSavedAuth } from './noteSession.js';
import { createDraft } from './noteDraftWriter.js';
import { resolveRuntimeOptions } from './config.js';
import { STORAGE_DIR, LOGS_DIR, SCREENSHOTS_DIR, ROOT } from './paths.js';
import { logger } from './logger.js';
import { resolve } from 'node:path';

const program = new Command();
program.name('note-auto-draft').description('note.com へ記事を自動で「下書き入稿」するローカルツール（公開はしない）');

// ---- doctor ----
program
  .command('doctor')
  .description('実行環境と設定を点検する')
  .action(() => {
    const ok = (b: boolean) => (b ? '✓' : '✗');
    let node = '', npm = '', pw = '';
    try { node = process.version; } catch { /* noop */ }
    try { npm = execSync('npm -v').toString().trim(); } catch { /* noop */ }
    try { pw = execSync('npx playwright --version', { cwd: ROOT }).toString().trim(); } catch { /* noop */ }

    const pwCache = process.platform === 'win32'
      ? resolve(process.env.LOCALAPPDATA ?? resolve(process.env.USERPROFILE ?? '', 'AppData/Local'), 'ms-playwright')
      : process.platform === 'darwin'
        ? resolve(process.env.HOME ?? '', 'Library/Caches/ms-playwright')
        : resolve(process.env.HOME ?? '', '.cache/ms-playwright');
    const chromium = existsSync(pwCache);
    const gi = existsSync(resolve(ROOT, '.gitignore')) ? readFileSync(resolve(ROOT, '.gitignore'), 'utf8') : '';
    const gitignoreOk = gi.includes('note-auth.json') && gi.includes('.env');

    console.log('== doctor ==');
    console.log(`${ok(!!node)} Node.js ${node}`);
    console.log(`${ok(!!npm)} npm ${npm}`);
    console.log(`${ok(!!pw)} Playwright ${pw}`);
    console.log(`${ok(chromium)} Chromium (ms-playwright cache)`);
    console.log(`${ok(existsSync(STORAGE_DIR))} storage/`);
    console.log(`${ok(existsSync(LOGS_DIR))} logs/`);
    console.log(`${ok(existsSync(SCREENSHOTS_DIR))} screenshots/`);
    console.log(`${ok(gitignoreOk)} .gitignore に秘密ファイル（note-auth.json / .env）が入っている`);
    console.log(`${ok(hasSavedAuth())} 保存済みログイン状態 storage/note-auth.json（無ければ npm run login）`);
  });

// ---- login ----
program
  .command('login')
  .description('ブラウザで手動ログインし、ログイン状態だけを保存する')
  .action(async () => {
    await runLogin();
  });

// ---- dry-run ----
program
  .command('dry-run')
  .argument('<dir>', '記事フォルダ（例: articles/sample）')
  .description('note にアクセスせず、記事フォルダの中身だけ検証する')
  .action((dir: string) => {
    const article = parseArticle(dir);
    const result = validateArticle(article);
    console.log('\n== dry-run ==');
    console.log(`記事フォルダ: ${dir}`);
    console.log(`タイトル: ${article.frontmatter.title || '(なし)'}`);
    console.log(`本文文字数: ${article.bodyText.length.toLocaleString()}`);
    console.log(`本文画像: ${article.images.length}枚`);
    console.log(`サムネイル: ${article.frontmatter.thumbnail ?? '(なし)'}`);
    console.log(`タグ: ${article.frontmatter.tags?.join(', ') ?? '(なし)'}`);
    if (result.issues.length) {
      console.log('\n-- チェック --');
      for (const i of result.issues) console.log(`${i.level === 'error' ? '✗ ERROR' : '△ WARN '} ${i.message}`);
    }
    console.log(`\n結果: ${result.ok ? 'OK（note にはまだアクセスしていません）' : 'NG（上の ERROR を直してください）'}`);
    if (!result.ok) process.exitCode = 1;
  });

// ---- draft ----
program
  .command('draft')
  .argument('<dir>', '記事フォルダ（例: articles/sample）')
  .option('--headed', 'ブラウザを見える状態で実行（既定）', true)
  .option('--headless', 'ブラウザを見せずに実行')
  .option('--pause-on-error', '終了時/失敗時にブラウザを閉じない')
  .option('--no-inline-images', '画像を本文中に挿入せず末尾にまとめる（安定重視）')
  .description('記事を note の下書きまで入稿する（公開はしない）')
  .action(async (dir: string, options: { headed?: boolean; headless?: boolean; pauseOnError?: boolean; inlineImages?: boolean }) => {
    if (!hasSavedAuth()) {
      logger.error('保存済みログイン状態がありません。先に `npm run login` を実行してください。');
      process.exitCode = 1;
      return;
    }
    const article = parseArticle(dir);
    const validation = validateArticle(article);
    for (const i of validation.issues) {
      if (i.level === 'error') logger.error(i.message);
      else logger.warn(i.message);
    }
    if (!validation.ok) {
      logger.error('検証エラーのため中止します（note にはアクセスしていません）。');
      process.exitCode = 1;
      return;
    }

    const opts = resolveRuntimeOptions({
      headed: options.headless ? false : true,
      pauseOnError: !!options.pauseOnError,
      inlineImages: options.inlineImages !== false,
    });

    logger.info({ dir, headed: opts.headed, inlineImages: opts.inlineImages }, '下書き作成を開始します');
    const result = await createDraft(article, opts);

    console.log('\n== draft result ==');
    if (result.ok) {
      console.log('✓ 下書き保存まで完了しました（公開はしていません）');
      console.log(`  下書きURL: ${result.draftUrl}`);
      console.log(`  本文画像: ${result.imagesInserted}枚 挿入`);
      console.log(`  サムネイル: ${result.thumbnailSet ? '設定済み' : '未設定'}`);
      console.log(`  スクリーンショット: ${result.screenshot}`);
      console.log('\n  → note の画面で内容を確認し、問題なければ手動で公開してください。');
    } else {
      console.log('✗ 失敗しました。');
      console.log(`  理由: ${result.error}`);
      console.log('  logs/ と screenshots/ を確認してください。--pause-on-error で画面を見ながら調べられます。');
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);
