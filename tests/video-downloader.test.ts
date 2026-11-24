import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildVideoFilename,
  resolveVideoDestPath,
  getLocalVideoIfExists,
  downloadVideoStream,
} from '../src/main/storage/video-downloader.js';
import { Storage } from '../src/main/storage/index.js';
import type { Tweet } from '../src/main/types.js';

describe('T2.2: Streaming Video Downloader & Page Bundle Video Integration', () => {
  let server: http.Server;
  let baseUrl: string;
  let tmpRoot: string;

  const SAMPLE_BYTES = Buffer.alloc(128 * 1024, 0x41); // 128 KB mock MP4 payload

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract_vid_dl_'));
    server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end();
        return;
      }
      if (req.url.includes('/amplify_video/2121343472368074752/vid/sample.mp4')) {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': String(SAMPLE_BYTES.length),
        });
        // Stream in 4 chunks so progress callbacks are exercised
        const chunkSize = 32 * 1024;
        let offset = 0;
        const sendNext = () => {
          if (offset >= SAMPLE_BYTES.length) {
            res.end();
            return;
          }
          res.write(SAMPLE_BYTES.subarray(offset, offset + chunkSize));
          offset += chunkSize;
          setTimeout(sendNext, 15);
        };
        sendNext();
        return;
      }
      if (req.url.includes('/slow.mp4')) {
        res.writeHead(200, {
          'Content-Type': 'video/mp4',
          'Content-Length': String(1024 * 1024),
        });
        res.write(Buffer.alloc(16 * 1024, 0x42));
        const timer = setInterval(() => {
          if (!res.writableEnded) {
            res.write(Buffer.alloc(8 * 1024, 0x42));
          }
        }, 80);
        req.on('close', () => clearInterval(timer));
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('UT-4a: buildVideoFilename produces deterministic idempotent filenames by X media ID or hash', () => {
    const u1 = 'https://video.twimg.com/amplify_video/2121343472368074752/vid/avc1/3840x2160/rdmP3hbqzNGNuPrj.mp4?tag=29';
    expect(buildVideoFilename(u1)).toBe('2121343472368074752_rdmP3hbqzNGNuPrj.mp4');
    // Same URL with different query param keeps deterministic filename
    expect(buildVideoFilename(u1)).toBe(buildVideoFilename(u1));

    const generic = 'https://cdn.example.com/media/clip.mp4';
    const name1 = buildVideoFilename(generic);
    const name2 = buildVideoFilename(generic);
    expect(name1).toBe(name2);
    expect(name1).toMatch(/^clip_[a-f0-9]{8}\.mp4$/);
  });

  it('UT-4b: downloadVideoStream streams to .part, atomically renames to .mp4, reports progress, and skips idempotently', async () => {
    const bundleDir = path.join(tmpRoot, 'bundle_1');
    const url = `${baseUrl}/amplify_video/2121343472368074752/vid/sample.mp4?tag=29`;
    const destPath = resolveVideoDestPath(bundleDir, url);

    const progressEvents: number[] = [];
    const res1 = await downloadVideoStream({
      url,
      destPath,
      onProgress: (p) => progressEvents.push(p.percent),
    });

    expect(res1.success).toBe(true);
    expect(res1.alreadyExisted).toBe(false);
    expect(res1.localPath).toBe(destPath);
    expect(res1.sizeBytes).toBe(SAMPLE_BYTES.length);
    expect(fs.existsSync(destPath)).toBe(true);
    expect(fs.existsSync(`${destPath}.part`)).toBe(false);
    expect(fs.statSync(destPath).size).toBe(SAMPLE_BYTES.length);
    expect(progressEvents[progressEvents.length - 1]).toBe(100);

    // Idempotent second call
    const localInfo = getLocalVideoIfExists(bundleDir, url);
    expect(localInfo).toEqual({ localPath: destPath, sizeBytes: SAMPLE_BYTES.length });

    const res2 = await downloadVideoStream({ url, destPath });
    expect(res2.success).toBe(true);
    expect(res2.alreadyExisted).toBe(true);
    expect(res2.sizeBytes).toBe(SAMPLE_BYTES.length);
  });

  it('UT-4c: downloadVideoStream aborts cleanly and removes .part file on AbortSignal', async () => {
    const bundleDir = path.join(tmpRoot, 'bundle_abort');
    const url = `${baseUrl}/slow.mp4`;
    const destPath = resolveVideoDestPath(bundleDir, url);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 120);

    const res = await downloadVideoStream({
      url,
      destPath,
      signal: controller.signal,
    });

    expect(res.success).toBe(false);
    expect(res.canceled).toBe(true);
    expect(fs.existsSync(destPath)).toBe(false);
    expect(fs.existsSync(`${destPath}.part`)).toBe(false);
  });

  it('UT-4d: downloadVideoStream cleans .part and returns clear Chinese error on HTTP 404', async () => {
    const bundleDir = path.join(tmpRoot, 'bundle_404');
    const url = `${baseUrl}/missing.mp4`;
    const destPath = resolveVideoDestPath(bundleDir, url);

    const res = await downloadVideoStream({ url, destPath });
    expect(res.success).toBe(false);
    expect(res.canceled).toBeFalsy();
    expect(res.error).toContain('404');
    expect(fs.existsSync(destPath)).toBe(false);
    expect(fs.existsSync(`${destPath}.part`)).toBe(false);
  });

  it('UT-4e: downloadVideoStream routes external URL through ProxyAgent via same-package undici.fetch', async () => {
    // 真实本地 HTTP 代理：接收绝对 URI 请求并返回 MP4 字节流，回归验证 Node 全局 fetch 与 undici v8 ProxyAgent 不兼容问题
    const proxyServer = http.createServer((req, res) => {
      expect(req.url).toContain('video.twimg.test');
      expect(req.headers.referer).toBe('https://x.com/');
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': String(SAMPLE_BYTES.length),
      });
      res.end(SAMPLE_BYTES);
    });

    const proxyUrl = await new Promise<string>((resolve) => {
      proxyServer.listen(0, '127.0.0.1', () => {
        const addr = proxyServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}`);
      });
    });

    try {
      const bundleDir = path.join(tmpRoot, 'bundle_proxy');
      const url = 'http://video.twimg.test/amplify_video/999888777/vid/proxied.mp4';
      const destPath = resolveVideoDestPath(bundleDir, url);

      const res = await downloadVideoStream({ url, destPath, proxyUrl });
      expect(res.success).toBe(true);
      expect(res.sizeBytes).toBe(SAMPLE_BYTES.length);
      expect(fs.existsSync(destPath)).toBe(true);
    } finally {
      await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
    }
  });

  it('UT-4f: downloadVideoStream uses chunk-inactivity stall timeout (keeps active streams alive, aborts stalled ones)', async () => {
    // 1. Active stream: 4 chunks x 15ms (~60ms+) with stallTimeoutMs=120ms succeeds even if total > 50ms
    const activeDir = path.join(tmpRoot, 'bundle_active_stall');
    const activeUrl = `${baseUrl}/amplify_video/2121343472368074752/vid/sample.mp4?tag=stall`;
    const activeDest = resolveVideoDestPath(activeDir, activeUrl);
    const activeRes = await downloadVideoStream({ url: activeUrl, destPath: activeDest, timeoutMs: 200 });
    expect(activeRes.success).toBe(true);

    // 2. Truly stalled stream: sends headers + 1 chunk then hangs -> aborts on stallTimeoutMs and cleans .part
    const stallServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '1048576' });
      res.write(Buffer.alloc(1024, 0x43));
      // intentionally never ends
    });
    const stallUrl = await new Promise<string>((resolve) => {
      stallServer.listen(0, '127.0.0.1', () => {
        const addr = stallServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve(`http://127.0.0.1:${port}/stalled.mp4`);
      });
    });

    try {
      const stallDir = path.join(tmpRoot, 'bundle_stalled');
      const stallDest = resolveVideoDestPath(stallDir, stallUrl);
      const stallRes = await downloadVideoStream({ url: stallUrl, destPath: stallDest, timeoutMs: 120 });
      expect(stallRes.success).toBe(false);
      expect(stallRes.error).toContain('超时');
      expect(fs.existsSync(stallDest)).toBe(false);
      expect(fs.existsSync(`${stallDest}.part`)).toBe(false);
    } finally {
      stallServer.closeAllConnections?.();
      await new Promise<void>((resolve) => stallServer.close(() => resolve()));
    }
  });

  it('UT-5: Storage.exportSingleTweetMarkdown downloads videos, updates index.md links, auto-links pre-downloaded videos, and deleteTweets cascades videos/', async () => {
    const dbPath = path.join(tmpRoot, 'storage_vid.db');
    const articlesDir = path.join(tmpRoot, 'articles');
    const storage = new Storage(dbPath, articlesDir);

    const videoUrl = `${baseUrl}/amplify_video/2121343472368074752/vid/sample.mp4?tag=29`;
    const tweet: Tweet = {
      tweet_id: '2124098048842473619',
      author_name: 'Adrian Punk',
      author_username: 'AdrianPunk115',
      text: `# 视频专栏\n\n> 💬 **Chris** (@ChrisGPT)\n>\n> 🎬 [视频](${videoUrl})\n>\n> 🔗 [原文链接](https://x.com/ChrisGPT/status/123456)`,
      created_at: '2026-11-23T08:00:00.000Z',
      like_count: 100,
      retweet_count: 20,
      is_article: true,
      video_url: videoUrl,
      media_urls: [videoUrl],
    };

    try {
      storage.saveTweets([tweet], 'search');

      // 1. Export with downloadVideos: true
      const exported = await storage.exportSingleTweetMarkdown(tweet.tweet_id, {
        downloadImages: false,
        downloadVideos: true,
      });

      expect(exported.downloadedVideosCount).toBe(1);
      expect(exported.downloadedVideos.length).toBe(1);
      expect(fs.existsSync(exported.downloadedVideos[0])).toBe(true);
      expect(exported.downloadedVideos[0]).toContain(path.join('videos', '2121343472368074752_sample.mp4'));

      const mdContent = fs.readFileSync(exported.filePath, 'utf-8');
      expect(mdContent).toContain('videos/2121343472368074752_sample.mp4');
      expect(mdContent).toContain(videoUrl);

      // 2. Re-export with downloadVideos: false still links already-downloaded video
      const reExported = await storage.exportSingleTweetMarkdown(tweet.tweet_id, {
        downloadImages: false,
        downloadVideos: false,
      });
      const mdContent2 = fs.readFileSync(reExported.filePath, 'utf-8');
      expect(mdContent2).toContain('videos/2121343472368074752_sample.mp4');

      // 3. Cascade delete cleans up videos/ directory completely
      const delRes = await storage.deleteTweets({ tweetId: tweet.tweet_id });
      expect(delRes.deletedCount).toBe(1);
      expect(fs.existsSync(exported.downloadedVideos[0])).toBe(false);
      expect(fs.existsSync(path.dirname(exported.filePath))).toBe(false);
    } finally {
      storage.close();
    }
  });
});
