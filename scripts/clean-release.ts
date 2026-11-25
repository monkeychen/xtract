import fs from 'node:fs';
import path from 'node:path';

const releaseDir = path.resolve(process.cwd(), 'release');

function getDirSizeBytes(dirPath: string): number {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        total += getDirSizeBytes(fullPath);
      } else {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // ignore transient files
        }
      }
    }
  } catch {
    // ignore missing dir
  }
  return total;
}

if (fs.existsSync(releaseDir)) {
  const bytes = getDirSizeBytes(releaseDir);
  fs.rmSync(releaseDir, { recursive: true, force: true });
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  process.stdout.write(`🧹 已清理历史打包产物 release/（释放约 ${mb} MB）\n`);
}
