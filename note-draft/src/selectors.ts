import type { Page, Locator, FrameLocator } from 'playwright';

/**
 * note.com のエディタ操作に使うセレクタを、ここ1か所に集約する（依頼書 §13.7）。
 *
 * 方針（依頼書 §14.3）：
 *   getByRole > getByLabel > getByPlaceholder > 表示テキスト > 安定属性 > CSS
 *   .sc-xxxx のような自動生成クラスや、階層依存の長いCSSには頼らない。
 *
 * 重要：note の画面は変わりうる。壊れたら基本ここだけ直す。
 * 各項目は「候補を順に試す」形にしてあり、初回は必ず headed で目視確認すること。
 */

export const URLS = {
  top: 'https://note.com/',
  // 新規エディタ。開くと editor.note.com 側で自動的に下書きが1件作られる。
  newNote: 'https://editor.note.com/new',
  login: 'https://note.com/login',
};

/** ログイン済みかの判定に使う目印（どれか1つでも見えていればログイン済みとみなす） */
export function loggedInMarkers(page: Page): Locator[] {
  return [
    page.getByRole('link', { name: '投稿' }),
    page.getByRole('button', { name: '投稿' }),
    page.locator('button:has-text("投稿")'),
    page.locator('[data-testid="header-user-menu"]'),
    page.locator('img[alt*="アイコン"]'),
  ];
}

/** 未ログインの目印（ログイン/新規登録リンクが見えている） */
export function loggedOutMarkers(page: Page): Locator[] {
  return [
    page.getByRole('link', { name: 'ログイン' }),
    page.getByRole('link', { name: '会員登録' }),
  ];
}

/**
 * エディタは iframe 内のことがある。まず本体、無ければ既知の iframe を探す。
 * 返り値は「本文/タイトルを探す起点」。
 */
export function editorScope(page: Page): (Page | FrameLocator)[] {
  return [page, page.frameLocator('iframe[title*="エディタ"]'), page.frameLocator('iframe')];
}

/** タイトル入力欄の候補（上から順に試す）。実画面：textarea[placeholder="記事タイトル"] */
export function titleCandidates(scope: Page | FrameLocator): Locator[] {
  return [
    scope.locator('textarea[placeholder="記事タイトル"]'),
    scope.getByPlaceholder('記事タイトル'),
    scope.locator('textarea[placeholder*="タイトル"]'),
  ];
}

/** 本文入力欄の候補。実画面：div[contenteditable="true"][role="textbox"] */
export function bodyCandidates(scope: Page | FrameLocator): Locator[] {
  return [
    scope.locator('div[contenteditable="true"][role="textbox"]'),
    scope.locator('div[contenteditable="true"]'),
    scope.getByRole('textbox').filter({ hasNot: scope.locator('textarea') }),
  ];
}

/**
 * 本文中に画像を挿入するためのファイル input の候補。
 * note は「+」メニュー→画像、から <input type=file> が現れる方式が多い。
 */
export function bodyImageInputCandidates(scope: Page | FrameLocator): Locator[] {
  return [
    scope.locator('input[type="file"][accept*="image"]'),
    scope.locator('input[type="file"]'),
  ];
}

/** 本文に画像ブロックを追加する「+」やツールバーのボタン候補 */
export function addBlockButtonCandidates(scope: Page | FrameLocator): Locator[] {
  return [
    scope.getByRole('button', { name: /画像/ }),
    scope.getByRole('button', { name: '追加' }),
    scope.locator('button[aria-label*="画像"]'),
    scope.locator('button[aria-label="追加"]'),
  ];
}

/** サムネイル（見出し画像）追加の入口ボタン候補 */
export function thumbnailButtonCandidates(page: Page): Locator[] {
  return [
    page.getByRole('button', { name: /見出し画像/ }),
    page.getByRole('button', { name: /画像を追加/ }),
    page.locator('button:has-text("画像を追加")'),
    page.locator('[data-testid="eyecatch-add"]'),
  ];
}

/** サムネイル用ファイル input の候補 */
export function thumbnailInputCandidates(page: Page): Locator[] {
  return [
    page.locator('input[type="file"][accept*="image"]'),
    page.locator('input[type="file"]'),
  ];
}

/**
 * 「画像をアップロード」後に出るクロップ/確定ダイアログの「保存/適用」ボタン候補。
 * 出ないテーマもあるので、無ければスキップする。
 */
export function imageConfirmCandidates(page: Page): Locator[] {
  return [
    page.getByRole('button', { name: '保存' }),
    page.getByRole('button', { name: '適用' }),
    page.getByRole('button', { name: '完了' }),
    page.getByRole('button', { name: 'この画像を挿入' }),
  ];
}

/** 「下書き保存」ボタンの候補（MVPの最終アクション） */
export function saveDraftCandidates(page: Page): Locator[] {
  return [
    page.getByRole('button', { name: '下書き保存' }),
    page.getByRole('button', { name: '下書きを保存' }),
    page.locator('button:has-text("下書き保存")'),
    page.locator('[data-testid="save-draft"]'),
  ];
}

/**
 * 公開系ボタンのテキスト。MVPでは「押さない」ためだけに列挙する（触れないよう検知に使う）。
 * 依頼書 §5.3：公開処理は実装しない。
 */
export const FORBIDDEN_PUBLISH_TEXTS = ['公開', '公開設定', '公開に進む', '投稿する', '予約投稿'];
