import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { Config } from '../config.js';
import type { VideoDownloadResult } from '../types.js';

export interface VideoDownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface DownloadVideoStreamOptions {
  url: string;
  destPath: string;
  proxyUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: VideoDownloadProgress) => void;
}

/**
 * 为推特/通用 MP4 视频链接生成确定性、幂等且无冲突的本地文件名：
 * - 命中 X 官方媒体 ID（amplify_video / ext_tw_video / tweet_video）：`<mediaId>_<stem>.mp4`
 * - 其他链接：`<stem>_<sha1_8>.mp4`
 */
export function buildVideoFilename(videoUrl: string): string {
  let rawStem = 'video';
  let ext = '.mp4';

  try {
    const u = new URL(videoUrl);
    const base = path.basename(u.pathname);
    const parsedExt = path.extname(base).toLowerCase();
    if (parsedExt && ['.mp4', '.mov', '.webm'].includes(parsedExt)) {
      ext = parsedExt;
    }
    const stem = path.basename(base, path.extname(base));
    if (stem) rawStem = stem;
  } catch {
    // fallback
  }

  const cleanStem = rawStem.replace(/[^\w\-.]/g, '_').slice(0, 32) || 'video';
  const idMatch = videoUrl.match(/(?:amplify_video|ext_tw_video|tweet_video)\/(\d+)/);
  if (idMatch?.[1]) {
    return `${idMatch[1]}_${cleanStem}${ext}`;
  }

  const hash = crypto.createHash('sha1').update(videoUrl).digest('hex').slice(0, 8);
  return `${cleanStem}_${hash}${ext}`;
}

export function resolveVideoDestPath(bundleDir: string, videoUrl: string): string {
  return path.join(bundleDir, 'videos', buildVideoFilename(videoUrl));
}

export function getLocalVideoIfExists(
  bundleDir: string,
  videoUrl: string
): { localPath: string; sizeBytes: number } | null {
  const destPath = resolveVideoDestPath(bundleDir, videoUrl);
  try {
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.isFile() && stat.size > 0) {
        return { localPath: destPath, sizeBytes: stat.size };
      }
    }
  } catch {
    // ignore fs errors
  }
  return null;
}

function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

function safeRemoveFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * 纯 Node.js 流式视频下载器（支持代理穿透、防盗链头、背压落盘、原子重命名与取消清理）。
 */
export async function downloadVideoStream(
  options: DownloadVideoStreamOptions
): Promise<VideoDownloadResult> {
  const { url, destPath, signal, onProgress } = options;
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  // 1. 幂等跳过：已完整落盘则直接返回
  try {
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.isFile() && stat.size > 0) {
        onProgress?.({ downloadedBytes: stat.size, totalBytes: stat.size, percent: 100 });
        return {
          success: true,
          videoUrl: url,
          localPath: destPath,
          sizeBytes: stat.size,
          alreadyExisted: true,
        };
      }
    }
  } catch {
    // proceed to download
  }

  const dir = path.dirname(destPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const partPath = `${destPath}.part`;
  safeRemoveFile(partPath);

  const internalController = new AbortController();
  let timedOut = false;
  let userCanceled = Boolean(signal?.aborted);

  const onExternalAbort = () => {
    userCanceled = true;
    internalController.abort();
  };

  if (signal) {
    if (signal.aborted) {
      return { success: false, videoUrl: url, canceled: true, error: '已取消下载' };
    }
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    internalController.abort();
  }, timeoutMs);

  let ws: fs.WriteStream | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const fetchOptions: Record<string, unknown> = {
      headers: {
        Referer: 'https://x.com/',
        Origin: 'https://x.com',
      },
      signal: internalController.signal,
    };

    const effectiveProxy = options.proxyUrl !== undefined ? options.proxyUrl : Config.HTTP_PROXY;
    if (effectiveProxy && !isLoopbackUrl(url)) {
      const { ProxyAgent } = await import('undici');
      fetchOptions.dispatcher = new ProxyAgent(effectiveProxy);
    }

    const res = await fetch(url, fetchOptions as RequestInit);

    if (!res.ok) {
      return {
        success: false,
        videoUrl: url,
        error: `视频下载失败（HTTP ${res.status}），请确认原视频仍可访问或代理畅通。`,
      };
    }

    if (!res.body) {
      return {
        success: false,
        videoUrl: url,
        error: '视频响应体为空，无法写入本地文件。',
      };
    }

    const totalBytes = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    ws = fs.createWriteStream(partPath);
    reader = res.body.getReader();

    let downloadedBytes = 0;
    let lastEmitAt = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        downloadedBytes += value.byteLength;
        const canContinue = ws.write(value);
        if (!canContinue) {
          await once(ws, 'drain');
        }
        const now = Date.now();
        if (onProgress && now - lastEmitAt >= 120) {
          lastEmitAt = now;
          const percent =
            totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
          onProgress({ downloadedBytes, totalBytes, percent });
        }
      }
    }

    // 优雅关闭写入流并等待刷盘
    const finished = once(ws, 'finish');
    ws.end();
    await finished;
    ws = null;

    if (downloadedBytes <= 0) {
      safeRemoveFile(partPath);
      return {
        success: false,
        videoUrl: url,
        error: '下载到的视频文件为空（0 字节），请稍后重试。',
      };
    }

    fs.renameSync(partPath, destPath);
    const finalSize = fs.statSync(destPath).size;
    onProgress?.({
      downloadedBytes: finalSize,
      totalBytes: totalBytes || finalSize,
      percent: 100,
    });

    return {
      success: true,
      videoUrl: url,
      localPath: destPath,
      sizeBytes: finalSize,
      alreadyExisted: false,
    };
  } catch (err: any) {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
    }
    if (ws) {
      try {
        ws.destroy();
      } catch {
        // ignore
      }
    }
    safeRemoveFile(partPath);

    if (userCanceled || signal?.aborted) {
      return { success: false, videoUrl: url, canceled: true, error: '已取消下载' };
    }
    if (timedOut) {
      return {
        success: false,
        videoUrl: url,
        error: '视频下载超时，请检查本地代理通道速度后重试。',
      };
    }
    const rawMsg = err?.cause?.message || err?.message || String(err);
    return {
      success: false,
      videoUrl: url,
      error: `视频下载失败：${rawMsg}（请检查本地网络代理设置）`,
    };
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}
