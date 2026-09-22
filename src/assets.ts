import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export type AssetStep =
  | { kind: 'text'; label: string; body: string; previewUrl: boolean }
  | { kind: 'image' | 'video' | 'audio'; label: string; file: string; mime: string; voice: boolean };

const specs = {
  Images: { kind: 'image' as const, mime: { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }, max: 5 * 1024 * 1024 },
  Videos: { kind: 'video' as const, mime: { '.mp4': 'video/mp4', '.3gp': 'video/3gpp' }, max: 16 * 1024 * 1024 },
  Audios: { kind: 'audio' as const, mime: { '.ogg': 'audio/ogg; codecs=opus', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.amr': 'audio/amr' }, max: 16 * 1024 * 1024 },
};

const spoken = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
function orderKey(filename: string): number | undefined {
  const stem = path.parse(filename).name.toLowerCase();
  if (/^\d+$/.test(stem)) return Number(stem);
  const index = spoken.indexOf(stem);
  return index >= 0 ? index : undefined;
}
export function orderFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const x = orderKey(a); const y = orderKey(b);
    if (x !== undefined && y !== undefined && x !== y) return x - y;
    if (x !== undefined && y === undefined) return -1;
    if (x === undefined && y !== undefined) return 1;
    return a.localeCompare(b, 'en', { numeric: true });
  });
}

async function readText(file: string): Promise<string> {
  const value = (await readFile(file, 'utf8')).trim();
  if (!value) throw new Error(`Empty required content: ${file}`);
  if (value.length > 4096) throw new Error(`Text exceeds WhatsApp text limit (4096 characters): ${file}`);
  return value;
}

async function listFiles(dir: string, extensions: readonly string[]): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter(item => item.isFile() && extensions.includes(path.extname(item.name).toLowerCase())).map(item => item.name);
  return orderFiles(files).map(name => path.join(dir, name));
}

async function mediaSteps<K extends keyof typeof specs>(root: string, folder: K): Promise<AssetStep[]> {
  const spec = specs[folder];
  const files = await listFiles(path.join(root, folder), Object.keys(spec.mime));
  const steps: AssetStep[] = [];
  for (const file of files) {
    const size = (await stat(file)).size;
    if (size <= 0 || size > spec.max) throw new Error(`File empty or exceeds size limit: ${file}`);
    const extension = path.extname(file).toLowerCase();
    const mime = (spec.mime as Record<string, string>)[extension];
    steps.push({ kind: spec.kind, label: `${folder}/${path.basename(file)}`, file, mime, voice: extension === '.ogg' });
  }
  return steps;
}

/** Snapshot the order and text at startup. Restart the app after changing Assets. */
export async function loadAssets(root: string): Promise<AssetStep[]> {
  const intro = await readText(path.join(root, 'text.txt'));
  const link = await readText(path.join(root, 'link.txt'));
  if (!/^https:\/\/\S+$/i.test(link) || /\s/.test(link)) throw new Error('Assets/link.txt must contain ONE HTTPS URL');
  const extras = await listFiles(path.join(root, 'Texts'), ['.txt']);
  const texts: AssetStep[] = [];
  for (const file of extras) texts.push({ kind: 'text', label: `Texts/${path.basename(file)}`, body: await readText(file), previewUrl: false });
  const images = await mediaSteps(root, 'Images');
  const videos = await mediaSteps(root, 'Videos');
  const audios = await mediaSteps(root, 'Audios');
  if (!images.length) console.warn('Assets/Images is empty: no images will be sent.');
  if (!videos.length) console.warn('Assets/Videos is empty: no videos will be sent.');
  if (!audios.length) console.warn('Assets/Audios is empty: no audios will be sent.');
  return [
    { kind: 'text', label: 'text.txt', body: intro, previewUrl: false },
    { kind: 'text', label: 'link.txt', body: link, previewUrl: true },
    ...texts, ...images, ...videos, ...audios,
  ];
}
