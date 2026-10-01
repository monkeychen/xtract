import { describe, it, expect, vi } from 'vitest';
import { normalizeTweetIdInputs } from '../src/main/cli/argv.js';
import { Pipeline } from '../src/main/pipeline/index.js';

/**
 * CLI 批量删除 / 批量导出（对齐 GUI 已有的多选批量操作）
 *
 * 回归背景：GUI 工作台支持勾选多篇推文批量删除、批量导出为 Page Bundle，
 * 而 CLI 的 --delete 只接受单个 ID、--export 只能按条数导出清单，
 * 两侧能力不对齐（本文件先红后绿）。
 */

describe('normalizeTweetIdInputs（批量 ID/URL 入参清洗）', () => {
  it('应支持逗号分隔的多 ID 输入', () => {
    expect(normalizeTweetIdInputs(['111111,222333'])).toEqual(['111111', '222333']);
    expect(normalizeTweetIdInputs([' 111111 , 222333 '])).toEqual(['111111', '222333']);
  });

  it('应从推文 URL 中提取纯数字 ID', () => {
    expect(normalizeTweetIdInputs(['https://x.com/dotey/status/2094624092015992854'])).toEqual([
      '2094624092015992854',
    ]);
  });

  it('应混合处理 URL、纯 ID 与逗号分隔并去重（保持首次出现顺序）', () => {
    const raw = ['111111', 'https://x.com/u/status/222333?s=20', '111111', '222333, 444555'];
    expect(normalizeTweetIdInputs(raw)).toEqual(['111111', '222333', '444555']);
  });

  it('应丢弃不含有效 ID 的噪声参数', () => {
    expect(normalizeTweetIdInputs(['abc', '1234', '', '  '])).toEqual([]);
  });

  it('undefined 与空数组应返回空数组', () => {
    expect(normalizeTweetIdInputs(undefined)).toEqual([]);
    expect(normalizeTweetIdInputs([])).toEqual([]);
  });
});

describe('Pipeline.exportTweetsByIds（批量导出，逐条容错）', () => {
  const existing = new Set(['10001', '10003']);

  function makePipeline(exportErr?: Error) {
    const storage = {
      getTweetById: vi.fn((id: string) =>
        existing.has(id) ? { tweet_id: id, author_username: 'a', text: 't' } : null
      ),
      exportSingleTweetMarkdown: vi.fn(async (id: string) => {
        if (exportErr) throw exportErr;
        return { filePath: `/tmp/bundle/${id}/index.md`, downloadedImagesCount: 0 };
      }),
      saveTweets: vi.fn(() => ({ inserted: 1, skipped: 0 })),
      getTotalCount: vi.fn(() => 1),
    };
    const pipeline = new Pipeline(storage as any, {} as any);
    const fetchSpy = vi
      .spyOn(pipeline, 'fetchTweetAndStore')
      .mockImplementation(async (id: string) => {
        if (id === 'net-fail') throw new Error('网络抓取失败');
        existing.add(id);
        return [{ tweet_id: id } as any];
      });
    return { pipeline, storage, fetchSpy };
  }

  it('本地已有的推文应直接导出，不发起网络抓取', async () => {
    const { pipeline, fetchSpy } = makePipeline();
    const res = await pipeline.exportTweetsByIds(['10001']);
    expect(res.exported).toEqual([{ tweetId: '10001', filePath: '/tmp/bundle/10001/index.md' }]);
    expect(res.failed).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('本地缺失的推文应先抓取再导出（与 GUI 批量导出行为一致）', async () => {
    const { pipeline, fetchSpy } = makePipeline();
    const res = await pipeline.exportTweetsByIds(['20002']);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('20002');
    expect(res.exported).toEqual([{ tweetId: '20002', filePath: '/tmp/bundle/20002/index.md' }]);
  });

  it('单条抓取失败不得中断其余条目（failed 记录原因）', async () => {
    const { pipeline } = makePipeline();
    const res = await pipeline.exportTweetsByIds(['net-fail', '30003']);
    expect(res.exported.map((e) => e.tweetId)).toEqual(['30003']);
    expect(res.failed).toEqual([{ tweetId: 'net-fail', error: '网络抓取失败' }]);
  });

  it('单条导出失败同样仅记入 failed，不中断批次', async () => {
    const { pipeline } = makePipeline(new Error('磁盘已满'));
    const res = await pipeline.exportTweetsByIds(['10001', '10003']);
    expect(res.exported).toEqual([]);
    expect(res.failed).toHaveLength(2);
    expect(res.failed[0].error).toContain('磁盘已满');
  });

  it('空输入应返回空结果且不做任何调用', async () => {
    const { pipeline, fetchSpy } = makePipeline();
    const res = await pipeline.exportTweetsByIds([]);
    expect(res).toEqual({ exported: [], failed: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
