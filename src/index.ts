import * as path from 'path';
import SwissTransferUploader from './core/SwissTransferUploader';
import * as cliProgress from 'cli-progress';

const uploader = new SwissTransferUploader();
uploader.addFiles(path.join(__dirname, '../tmp/cervin.jpg'));
uploader.on('addFileError', console.log);
const bar = new cliProgress.SingleBar(
  {
    format: '{bar} {percentage}% | ETA: {eta}s',
  },
  cliProgress.Presets.shades_classic
);
bar.start(1, 0);
uploader.on('uploadProgress', progress => {
  const p = progress();
  bar.update(p.percent);
});
uploader.on('done', results => {
  bar.stop();
  results.forEach(res => {
    console.log(`https://www.swisstransfer.com/d/${res.linkUUID}`);
  });
});

// uploader.upload();
