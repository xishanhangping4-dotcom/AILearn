import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// usage: node scripts/gen-illust.mjs "<prompt>" <outRelPath> [size] [background] [quality]
const [, , prompt, outRel, size = '1024x1024', background = 'opaque', quality = 'medium'] = process.argv;
if (!prompt || !outRel) {
  console.error('usage: node scripts/gen-illust.mjs "<prompt>" <outRelPath> [size] [background] [quality]');
  process.exit(1);
}

const rootDir = process.cwd();
const envText = await readFile(path.join(rootDir, '.env'), 'utf8').catch(() => '');
const apiKey = envText.match(/^OPENAI_API_KEY\s*=\s*["']?([^\r\n"']+)["']?\s*$/m)?.[1]?.trim()
  ?? process.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  console.error('人物イラストを作るには OpenAI の API キーが必要です（図解だけなら不要です）。');
  console.error('note-draft フォルダの .env.example をコピーして .env という名前で保存し、');
  console.error('OPENAI_API_KEY=（あなたのキー） の行を有効にしてください。');
  process.exit(1);
}

const response = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1, background, quality }),
});

if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
const payload = await response.json();
const image = Buffer.from(payload.data[0].b64_json, 'base64');
const outputPath = path.join(rootDir, outRel);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, image);
console.log(`${outputPath} (${image.byteLength} bytes)`);
