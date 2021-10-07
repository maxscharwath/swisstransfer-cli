import * as path from 'path';
import SwissTransferUploader, {ProgressChildren} from './core/SwissTransferUploader';
import * as cliProgress from 'cli-progress';
import * as fs from 'fs';

const srcFile = path.join(__dirname, '..');
const files = fs.readdirSync(srcFile).map(file => path.join(srcFile, file));
const uploader = new SwissTransferUploader();
uploader.addFiles(...files);
const multiBar = new cliProgress.MultiBar(
  {
    format: '{bar} {percentage}% | ETA: {eta}s | {name}',
  },
  cliProgress.Presets.shades_classic
);
const barMap = new Map<string, cliProgress.SingleBar>();

function progressBarChildren(progress: ProgressChildren<{name: string}>) {
  let bar = barMap.get(progress.name);
  if (!bar) {
    bar = multiBar.create(1, 0);
    barMap.set(progress.name, bar);
  }
  bar.update(progress.percent, {name: progress.name});
  progress.children?.forEach(child => progressBarChildren(child));
}

uploader.on('uploadProgress', progress => {
  progressBarChildren(progress());
});
uploader.on('done', results => {
  multiBar.stop();
  results.forEach(res => {
    console.log(`https://www.swisstransfer.com/d/${res.linkUUID}`);
  });
});

uploader.upload();
