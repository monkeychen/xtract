import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  XTRACT_MEDIA_SCHEME,
  buildLocalMediaUrl,
  resolveSafeMediaFilePath,
  parseByteRange,
  handleMediaProtocolRequest,
} from '../src/main/media-protocol.js';

describe('T2.3: Controlled Local Media Protocol (xtract-media://) & HTTP Range', () => {
  let tmpArticlesDir: string;
  let videoFilePath: string;
  const payload = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ');

  beforeAll(() => {
    tmpArticlesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xtract_media_proto_'));
    const videoDir = path.join(tmpArticlesDir, 'AdrianPunk115', '2124098048842473619', 'videos');
    fs.mkdirSync(videoDir, { recursive: true });
    videoFilePath = path.join(videoDir, '2121343472368074752_sample.mp4');
    fs.writeFileSync(videoFilePath, payload);

    // Non-media file inside articles dir (must be rejected by extension allowlist)
    fs.writeFileSync(path.join(tmpArticlesDir, 'secret.env'), 'SECRET=1');
  });

  afterAll(() => {
    fs.rmSync(tmpArticlesDir, { recursive: true, force: true });
  });

  it('UT-6a: buildLocalMediaUrl and resolveSafeMediaFilePath round-trip safely and block traversal / non-media files', () => {
    const mediaUrl = buildLocalMediaUrl(tmpArticlesDir, videoFilePath);
    expect(mediaUrl).toBe(
      `${XTRACT_MEDIA_SCHEME}://articles/AdrianPunk115/2124098048842473619/videos/2121343472368074752_sample.mp4`
    );

    const resolved = resolveSafeMediaFilePath(mediaUrl!, tmpArticlesDir);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.filePath).toBe(path.resolve(videoFilePath));
    }

    // Path traversal attempts must be denied with 403
    const traversal1 = resolveSafeMediaFilePath(
      `${XTRACT_MEDIA_SCHEME}://articles/../../etc/passwd.mp4`,
      tmpArticlesDir
    );
    expect(traversal1.ok).toBe(false);
    if (!traversal1.ok) expect(traversal1.status).toBe(403);

    const traversal2 = resolveSafeMediaFilePath(
      `${XTRACT_MEDIA_SCHEME}://articles/%2e%2e%2f%2e%2e%2fsecret.mp4`,
      tmpArticlesDir
    );
    expect(traversal2.ok).toBe(false);
    if (!traversal2.ok) expect(traversal2.status).toBe(403);

    // Non-media extension must be denied with 403
    const nonMedia = resolveSafeMediaFilePath(
      `${XTRACT_MEDIA_SCHEME}://articles/secret.env`,
      tmpArticlesDir
    );
    expect(nonMedia.ok).toBe(false);
    if (!nonMedia.ok) expect(nonMedia.status).toBe(403);
  });

  it('UT-6b: parseByteRange handles explicit, open-ended, suffix, and invalid ranges', () => {
    expect(parseByteRange('bytes=0-9', 62)).toEqual({ ok: true, start: 0, end: 9 });
    expect(parseByteRange('bytes=10-', 62)).toEqual({ ok: true, start: 10, end: 61 });
    expect(parseByteRange('bytes=0-999', 62)).toEqual({ ok: true, start: 0, end: 61 });
    expect(parseByteRange('bytes=-10', 62)).toEqual({ ok: true, start: 52, end: 61 });
    expect(parseByteRange('bytes=100-200', 62)).toEqual({ ok: false });
    expect(parseByteRange('bytes=20-10', 62)).toEqual({ ok: false });
  });

  it('UT-6c: handleMediaProtocolRequest serves 200 OK, 206 Partial Content, 403, 404, and 416', async () => {
    const mediaUrl = buildLocalMediaUrl(tmpArticlesDir, videoFilePath)!;

    // 1. Full 200 OK
    const fullRes = await handleMediaProtocolRequest(new Request(mediaUrl), tmpArticlesDir);
    expect(fullRes.status).toBe(200);
    expect(fullRes.headers.get('accept-ranges')).toBe('bytes');
    expect(fullRes.headers.get('content-type')).toBe('video/mp4');
    expect(fullRes.headers.get('content-length')).toBe(String(payload.length));
    const fullBuf = Buffer.from(await fullRes.arrayBuffer());
    expect(fullBuf.equals(payload)).toBe(true);

    // 2. Partial 206 Range request
    const rangeRes = await handleMediaProtocolRequest(
      new Request(mediaUrl, { headers: { Range: 'bytes=10-19' } }),
      tmpArticlesDir
    );
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get('content-range')).toBe(`bytes 10-19/${payload.length}`);
    expect(rangeRes.headers.get('content-length')).toBe('10');
    const sliceText = await rangeRes.text();
    expect(sliceText).toBe('abcdefghij');

    // 3. Out-of-bounds Range -> 416
    const badRangeRes = await handleMediaProtocolRequest(
      new Request(mediaUrl, { headers: { Range: 'bytes=500-600' } }),
      tmpArticlesDir
    );
    expect(badRangeRes.status).toBe(416);

    // 4. Non-existent video -> 404
    const notFoundRes = await handleMediaProtocolRequest(
      new Request(`${XTRACT_MEDIA_SCHEME}://articles/nobody/123/videos/missing.mp4`),
      tmpArticlesDir
    );
    expect(notFoundRes.status).toBe(404);

    // 5. Forbidden encoded traversal & non-media file -> 403
    const forbiddenRes = await handleMediaProtocolRequest(
      new Request(`${XTRACT_MEDIA_SCHEME}://articles/%2e%2e%2f%2e%2e%2fetc/passwd.mp4`),
      tmpArticlesDir
    );
    expect(forbiddenRes.status).toBe(403);

    const forbiddenExtRes = await handleMediaProtocolRequest(
      new Request(`${XTRACT_MEDIA_SCHEME}://articles/secret.env`),
      tmpArticlesDir
    );
    expect(forbiddenExtRes.status).toBe(403);
  });
});
