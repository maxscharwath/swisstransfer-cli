import SwissTransferDownloader from '../src/core/SwissTransferDownloader';
import * as path from 'path';

describe('SwissTransferUploader', () => {
  it('should download file', done => {
    const downloader = new SwissTransferDownloader({
      linkUUID: '4ad9f515-6d84-4547-9bc4-8b707c685ad9',
      password: '123456789',
    });
    downloader.on('downloadProgress', progress => {
      console.log(progress());
    });
    downloader
      .download(path.join(__dirname, '../dist'))
      .then(console.log)
      .catch(console.log)
      .finally(() => done());
  });
});
