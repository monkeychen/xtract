import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export const XTRACT_MEDIA_SCHEME = 'xtract-media';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * 将位于 articlesDir 内的本地文件绝对路径编码为受控 `xtract-media://articles/...` URL。
 * 若文件不在 articlesDir 之内则返回 null。
 */
export function buildLocalMediaUrl(articlesDir: string, localFilePath: string): string | null {
  const rootAbs = path.resolve(articlesDir);
  const fileAbs = path.resolve(localFilePath);
  const rel = path.relative(rootAbs, fileAbs);

  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  const encodedSegments = rel.split(path.sep).map((seg) => encodeURIComponent(seg));
  return `${XTRACT_MEDIA_SCHEME}://articles/${encodedSegments.join('/')}`;
}

/**
 * 解析并严格校验 `xtract-media://articles/...` 请求路径：
 * 1. 必须命中 articles 主机名；
 * 2. 解码并规范化后必须严格位于 articlesDir 之内（阻断路径穿越）；
 * 3. 扩展名必须在媒体白名单内。
 */
export function resolveSafeMediaFilePath(
  requestUrl: string,
  articlesDir: string
): { ok: true; filePath: string; mimeType: string } | { ok: false; status: number; message: string } {
  // 在 WHATWG URL 自动折叠 ".." 之前先拦截原始路径穿越序列
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)|%2e%2e/i.test(requestUrl)) {
    return { ok: false, status: 403, message: 'Path traversal blocked' };
  }

  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return { ok: false, status: 400, message: 'Invalid media URL' };
  }

  if (parsed.protocol !== `${XTRACT_MEDIA_SCHEME}:` || parsed.hostname !== 'articles') {
    return { ok: false, status: 403, message: 'Forbidden media scope' };
  }

  // 防范编码形式的路径穿越（如 %2e%2e%2f）与原始 .. 段落
  const rawSegments = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (rawSegments.length === 0) {
    return { ok: false, status: 403, message: 'Missing media path' };
  }

  const decodedSegments: string[] = [];
  for (const seg of rawSegments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      return { ok: false, status: 400, message: 'Malformed URI segment' };
    }
    if (
      !decoded ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
    ) {
      return { ok: false, status: 403, message: 'Path traversal blocked' };
    }
    decodedSegments.push(decoded);
  }

  const rootAbs = path.resolve(articlesDir);
  const candidate = path.resolve(rootAbs, ...decodedSegments);
  const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
  if (!candidate.startsWith(rootPrefix)) {
    return { ok: false, status: 403, message: 'Path escapes articles directory' };
  }

  const ext = path.extname(candidate).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) {
    return { ok: false, status: 403, message: 'Unsupported media file type' };
  }

  return { ok: true, filePath: candidate, mimeType };
}

/**
 * 解析 HTTP `Range: bytes=start-end` 请求头，支持显式区间、开放尾区间与后缀区间。
 */
export function parseByteRange(
  rangeHeader: string,
  fileSize: number
): { ok: true; start: number; end: number } | { ok: false } {
  if (!rangeHeader || fileSize <= 0) return { ok: false };
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return { ok: false };

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return { ok: false };

  let start: number;
  let end: number;

  if (!rawStart) {
    // Suffix range: bytes=-N (last N bytes)
    const suffixLen = parseInt(rawEnd, 10);
    if (isNaN(suffixLen) || suffixLen <= 0) return { ok: false };
    start = Math.max(0, fileSize - suffixLen);
    end = fileSize - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd ? parseInt(rawEnd, 10) : fileSize - 1;
    if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize) {
      return { ok: false };
    }
    end = Math.min(end, fileSize - 1);
    if (end < start) return { ok: false };
  }

  return { ok: true, start, end };
}

/**
 * 处理 `xtract-media://` 自定义协议请求，支持完整 200 OK 与 HTTP Range 206 Partial Content 流式拖动。
 */
export async function handleMediaProtocolRequest(
  request: Request,
  articlesDir: string
): Promise<Response> {
  const resolved = resolveSafeMediaFilePath(request.url, articlesDir);
  if (!resolved.ok) {
    return new Response(resolved.message, { status: resolved.status });
  }

  const { filePath, mimeType } = resolved;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return new Response('Not Found', { status: 404 });
    }
  } catch {
    return new Response('Not Found', { status: 404 });
  }

  const fileSize = stat.size;
  const rangeHeader = request.headers.get('range');

  if (rangeHeader) {
    const parsedRange = parseByteRange(rangeHeader, fileSize);
    if (!parsedRange.ok) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      });
    }

    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream;

    return new Response(webStream, {
      status: 206,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    },
  });
}
