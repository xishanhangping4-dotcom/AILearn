import type { Page, Locator, FrameLocator } from 'playwright';
import {
  editorScope,
  titleCandidates,
  bodyCandidates,
  saveDraftCandidates,
} from './selectors.js';
import type { ParsedArticle } from './types.js';
import { logger } from './logger.js';

/** 候補ロケータを順に試し、最初に「見えている」ものを返す */
async function firstVisible(cands: Locator[], timeout = 2500): Promise<Locator | null> {
  for (const loc of cands) {
    try {
      const el = loc.first();
      if (await el.isVisible({ timeout })) return el;
    } catch {
      /* 次の候補へ */
    }
  }
  return null;
}

/** エディタ本体（タイトル/本文）が描画されるまで待つ。note編集画面はSPAで数秒かかる */
export async function waitForEditorReady(page: Page): Promise<void> {
  await page.waitForSelector('textarea[placeholder="記事タイトル"], div[contenteditable="true"][role="textbox"]', {
    timeout: 45000,
  });
  await page.waitForTimeout(1200);
}

/** エディタの起点（本体 or iframe）のうち、本文欄が見つかるものを選ぶ。note編集はiframe無しの想定 */
async function resolveScope(page: Page): Promise<Page | FrameLocator> {
  for (const scope of editorScope(page)) {
    const body = await firstVisible(bodyCandidates(scope), 1500);
    if (body) return scope;
  }
  return page;
}

export async function fillTitle(scope: Page | FrameLocator, title: string): Promise<void> {
  const el = await firstVisible(titleCandidates(scope));
  if (!el) throw new Error('タイトル入力欄が見つかりませんでした（selectors.ts の titleCandidates を確認）');
  await el.click();
  await el.fill(title);
  logger.info({ step: 'title', chars: title.length }, 'タイトルを入力しました');
}

/**
 * 本文を入力する。テキストはキーボード入力、画像は「画像を追加」ボタン→ファイル選択で挿入。
 */
/**
 * 本文を入力する。
 * 手順：まず本文テキストを全部入れる（崩れない）→ 各画像を「直前段落」を目印にその位置へ差し込む。
 * テキストと画像を交互に打たないので、note側のリスト化などの崩れを避けられる。
 * inlineImages=false のときは画像を末尾にまとめる。
 */
export async function fillBody(
  page: Page,
  scope: Page | FrameLocator,
  article: ParsedArticle,
  inlineImages: boolean,
): Promise<{ imagesInserted: number }> {
  const body = await firstVisible(bodyCandidates(scope));
  if (!body) throw new Error('本文入力欄が見つかりませんでした（selectors.ts の bodyCandidates を確認）');

  await body.click();
  await typeText(page, body, article.bodyText);

  // 各画像の「差し込み位置の目印」＝直前テキストブロックの最後の段落
  const jobs: { absPath: string; anchor: string | null }[] = [];
  let precedingTail: string | null = null;
  for (const b of article.blocks) {
    if (b.type === 'text') {
      const lines = b.text.split('\n').map((s) => s.trim()).filter(Boolean);
      precedingTail = lines.length ? lines[lines.length - 1] : precedingTail;
    } else {
      jobs.push({ absPath: b.image.absPath, anchor: inlineImages ? precedingTail : null });
    }
  }

  // インライン挿入は「下から順」に行う。上の文章構造が変わらないので位置がズレにくい。
  const order = inlineImages ? [...jobs].reverse() : jobs;
  let imagesInserted = 0;
  for (const job of order) {
    let placed = false;
    if (job.anchor) placed = await placeCaretAfterParagraph(page, body, job.anchor);
    if (!placed) await gotoDocEnd(page, body); // 目印が見つからなければ末尾に
    await page.keyboard.press('Enter'); // 画像用の空段落
    await page.waitForTimeout(400);
    if (await insertImageAtCursor(page, job.absPath)) imagesInserted++;
  }

  logger.info(
    { step: 'body', chars: article.bodyText.length, imagesInserted, mode: inlineImages ? 'inline' : 'append' },
    '本文を入力しました',
  );
  return { imagesInserted };
}

/** 本文の末尾にカーソルを移動する（全選択→右で選択解除して末尾へ） */
async function gotoDocEnd(page: Page, body: Locator): Promise<void> {
  await body.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ArrowRight');
}

/**
 * 指定した段落（末尾テキストで特定）の直後にカーソルを置く。
 * ①その段落を実クリックしてProseMirrorにフォーカス＆キャレットを入れる（確実）
 * ②JSでその段落の末尾にキャレットを畳む（同期を確実にするため、直後にキー操作でnudge）
 */
async function placeCaretAfterParagraph(page: Page, body: Locator, anchor: string): Promise<boolean> {
  const tail = anchor.length > 16 ? anchor.slice(-16) : anchor;
  const block = body.locator('> *').filter({ hasText: tail }).last();
  if (!(await block.count().catch(() => 0))) return false;
  try {
    await block.scrollIntoViewIfNeeded();
    await block.click();
  } catch {
    return false;
  }
  // クリックで入ったキャレットのある段落の末尾へ畳む
  await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : (sel.anchorNode as Element);
    const b = (node as Element)?.closest('p,div,h1,h2,h3,li');
    if (!b) return;
    const range = document.createRange();
    range.selectNodeContents(b);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await page.keyboard.press('End'); // ProseMirrorへ選択変更を確実に反映
  return true;
}

async function typeText(page: Page, body: Locator, text: string): Promise<void> {
  await body.click();
  const paragraphs = text.split('\n');
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].length) await page.keyboard.type(paragraphs[i], { delay: 1 });
    if (i < paragraphs.length - 1) await page.keyboard.press('Enter');
  }
}

/**
 * カーソルのある空行に画像を1枚挿入する。
 * 手順（実画面で確認）：「画像を追加」ボタン → メニューの「画像をアップロード」→ ファイル選択(filechooser)。
 */
async function clickAndGetChooser(page: Page, loc: Locator, timeout: number) {
  const [ch] = await Promise.all([page.waitForEvent('filechooser', { timeout }), loc.click()]);
  return ch;
}

/**
 * 画像メニュー（「画像をアップロード」or ＋メニューの「画像」）を開いてファイル選択(filechooser)を得る。
 * 追加ボタンを押してメニューが開いた状態で呼ぶこと。
 */
async function pickUploadChooser(page: Page) {
  const uploadA = page.getByRole('button', { name: /画像をアップロード/ }).first();
  if (await uploadA.isVisible({ timeout: 2000 }).catch(() => false)) {
    return clickAndGetChooser(page, uploadA, 8000).catch(() => null);
  }
  const imgItem = page.getByRole('button', { name: '画像', exact: true }).first();
  if (await imgItem.isVisible({ timeout: 2500 }).catch(() => false)) {
    const ch = await clickAndGetChooser(page, imgItem, 4000).catch(() => null);
    if (ch) return ch;
    const uploadB = page.getByRole('button', { name: /画像をアップロード/ }).first();
    if (await uploadB.isVisible({ timeout: 3000 }).catch(() => false)) {
      return clickAndGetChooser(page, uploadB, 8000).catch(() => null);
    }
  }
  return null;
}

/** アップロード後の切り抜き(crop)モーダルを「保存」で確定する（トップの「下書き保存」と誤爆しないよう完全一致） */
async function confirmCropSave(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="cropper"], .reactEasyCrop_CropArea', { timeout: 10000 }).catch(() => {});
  const cropSave = page.getByRole('button', { name: '保存', exact: true }).first();
  if (await cropSave.isVisible({ timeout: 4000 }).catch(() => false)) {
    await cropSave.click();
  }
  await page.waitForSelector('[data-testid="cropper"]', { state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function insertImageAtCursor(page: Page, absPath: string): Promise<boolean> {
  try {
    // 追加ボタンは行によって2種類：最初の空行は「画像を追加」、画像の後などは「メニューを開く」(＋)
    const addImage = await firstVisible(
      [
        page.getByRole('button', { name: '画像を追加' }),
        page.getByRole('button', { name: 'メニューを開く' }),
      ],
      3500,
    );
    if (!addImage) {
      logger.warn({ absPath }, '画像の追加ボタン（画像を追加/メニューを開く）が見つからずスキップしました');
      return false;
    }
    await addImage.click();
    await page.waitForTimeout(400);

    const chooser = await pickUploadChooser(page);
    if (!chooser) {
      logger.warn({ absPath }, '画像アップロードの入口が出ずスキップしました');
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await chooser.setFiles(absPath);
    await confirmCropSave(page);
    return true;
  } catch (e) {
    logger.warn({ absPath, err: String(e).slice(0, 120) }, '本文画像の挿入に失敗、スキップしました');
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }
}

/**
 * サムネイル（見出し画像）を設定する。タイトル上部の「画像を追加」ボタン（aria-label同じだが上部にある）から、
 * 「画像をアップロード（推奨1280×670）」→ ファイル選択 → 切り抜き保存。
 * 本文入力の前に呼ぶ想定（上部ボタンが一意に取りやすい）。入口が無ければスキップ。
 */
export async function setThumbnail(page: Page, absPath: string): Promise<boolean> {
  // 上部（タイトルより上、y<220）にある「画像を追加」ボタン＝見出し画像の入口
  const buttons = page.getByRole('button', { name: '画像を追加' });
  const count = await buttons.count().catch(() => 0);
  let eyecatch: Locator | null = null;
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const box = await b.boundingBox().catch(() => null);
    if (box && box.y < 220) { eyecatch = b; break; }
  }
  if (!eyecatch) {
    logger.warn('見出し画像（サムネイル）の入口が見つかりませんでした。スキップします（本文は保存します）');
    return false;
  }
  try {
    await eyecatch.click();
    await page.waitForTimeout(400);
    const chooser = await pickUploadChooser(page);
    if (!chooser) {
      logger.warn('サムネイルのアップロード入口が出ずスキップしました');
      await page.keyboard.press('Escape').catch(() => {});
      return false;
    }
    await chooser.setFiles(absPath);
    await confirmCropSave(page);
    logger.info({ step: 'thumbnail' }, 'サムネイルを設定しました');
    return true;
  } catch (e) {
    logger.warn({ err: String(e).slice(0, 120) }, 'サムネイル設定に失敗、スキップしました');
    return false;
  }
}

/** 下書き保存する（MVPの最終アクション）。「公開に進む」には触れない */
export async function saveDraft(page: Page): Promise<string> {
  const btn = await firstVisible(saveDraftCandidates(page), 5000);
  if (!btn) throw new Error('「下書き保存」ボタンが見つかりませんでした（selectors.ts の saveDraftCandidates を確認）');
  const label = (await btn.textContent())?.trim() || '下書き保存';
  await btn.click();
  await page.waitForTimeout(2500);
  logger.info({ step: 'save-draft', label }, '下書き保存を実行しました');
  return label;
}

export { resolveScope };
