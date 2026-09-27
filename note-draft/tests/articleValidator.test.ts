import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArticle } from '../src/articleParser.js';
import { validateArticle } from '../src/articleValidator.js';

const TMP = resolve(process.cwd(), 'tests/.tmp-validator');

function writeArticle(md: string) {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(resolve(TMP, 'images'), { recursive: true });
  writeFileSync(resolve(TMP, 'images/ok.png'), 'x');
  writeFileSync(resolve(TMP, 'article.md'), md);
}

beforeAll(() => {
  writeArticle(
    ['---', 'title: 正常記事', '---', '', '本文があります。', '', '![a](./images/ok.png)'].join('\n'),
  );
});

describe('validateArticle', () => {
  it('正常な記事は ok=true（サムネ未指定は warn）', () => {
    const r = validateArticle(parseArticle(TMP));
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.level === 'warn')).toBe(true);
  });

  it('title が空なら error', () => {
    writeArticle(['---', 'title: ""', '---', '', '本文。'].join('\n'));
    const r = validateArticle(parseArticle(TMP));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.level === 'error' && i.message.includes('title'))).toBe(true);
  });

  it('存在しない画像は error', () => {
    writeArticle(['---', 'title: X', '---', '', '本文。', '', '![a](./images/nope.png)'].join('\n'));
    const r = validateArticle(parseArticle(TMP));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('本文画像が存在しません'))).toBe(true);
  });

  it('非対応拡張子（.gif）は error', () => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(resolve(TMP, 'images'), { recursive: true });
    writeFileSync(resolve(TMP, 'images/x.gif'), 'x');
    writeFileSync(resolve(TMP, 'article.md'), ['---', 'title: X', '---', '', '本文。', '', '![a](./images/x.gif)'].join('\n'));
    const r = validateArticle(parseArticle(TMP));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.message.includes('非対応の拡張子'))).toBe(true);
  });
});
