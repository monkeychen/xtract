import { Command } from 'commander';
import { Config } from './config.js';

// Dual-mode dispatcher: determine CLI vs GUI
const args = process.argv.slice(2);
const isCLI = args.length > 0;

if (isCLI) {
  const program = new Command();

  program
    .name('xtract')
    .description('Production-grade X (Twitter) intelligence radar & AI digest.')
    .version('1.0.0')
    .option('--trends', 'View current trending topics')
    .option('--trends-digest', 'Generate in-depth digest for trends')
    .option('--fetch-only', 'Fetch following timeline only')
    .option('--report-only', 'Generate daily report from local DB only')
    .option('--search <query>', 'Search tweets by query')
    .option('--user <username>', 'Fetch tweets for a specific user')
    .option('--x-list <listId>', 'Fetch tweets from a list')
    .option('--list [limit]', 'List recently stored tweets')
    .option('--hours <hours>', 'Hours lookback window', '24')
    .option('--category <category>', 'Trends category', 'tech')
    .option('--json', 'Output results as pure JSON')
    .action(async (options) => {
      Config.ensureDirs();
      if (options.json) {
        process.stdout.write(JSON.stringify({ status: 'ok', engine: 'node', options }, null, 2) + '\n');
      } else {
        process.stdout.write(`🗞️ Xtract (Node.js/Electron Engine v1.0.0)\n`);
        process.stdout.write(`Active options: ${JSON.stringify(options)}\n`);
      }
      process.exit(0);
    });

  const cleanArgs = process.argv.filter((arg) => arg !== '--');
  program.parse(cleanArgs);
} else {
  // Lazy import electron only when launching GUI
  import('electron').then(({ app, BrowserWindow }) => {
    app.whenReady().then(() => {
      const win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Xtract - Intelligence Radar',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      win.loadURL('data:text/html;charset=utf-8,<html><body style="font-family:system-ui;background:%230f172a;color:%23f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;"><h1>🗞️ Xtract Desktop Ready</h1></body></html>');
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  });
}
