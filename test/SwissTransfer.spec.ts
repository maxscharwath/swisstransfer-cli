import SwissTransferUploader, {ResponseComplete} from '../src/core/SwissTransferUploader';
import * as path from 'path';
import * as fs from 'fs';
import SwissTransferDownloader from '../src/core/SwissTransferDownloader';

function generateFile(filePath: string, size: number) {
  return new Promise((resolve, reject) => {
    if (size < 0) {
      return reject("Error: a negative size doesn't make any sense");
    }
    setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        const fd = fs.openSync(filePath, 'w');
        if (size > 0) {
          fs.writeSync(fd, Buffer.alloc(1), 0, 1, size - 1);
        }
        fs.closeSync(fd);

        resolve(true);
      } catch (error) {
        reject(error);
      }
    }, 0);
  });
}

describe('SwissTransfer', () => {
  const srcPath = path.join(__dirname, './srcFiles');
  const dstPath = path.join(__dirname, './dstFiles');
  before(async () => {
    console.log('Clear temp folders');
    await fs.promises.rm(path.join(srcPath), {force: true, recursive: true});
    await fs.promises.rm(path.join(dstPath), {force: true, recursive: true});
    console.log('Create dummy files');
    await generateFile(path.join(srcPath, './1MB.dat'), 1024 * 1024);
    await generateFile(path.join(srcPath, './10MB.dat'), 10 * 1024 * 1024);
    await generateFile(path.join(srcPath, './50MB.dat'), 50 * 1024 * 1024);
    await generateFile(path.join(srcPath, './100MB.dat'), 100 * 1024 * 1024);
  });
  after(async () => {
    console.log('Clear temp folders');
    await fs.promises.rm(path.join(srcPath), {force: true, recursive: true});
    await fs.promises.rm(path.join(dstPath), {force: true, recursive: true});
  });
  let uploadResponse: ResponseComplete[];
  it('should upload some files', async () => {
    const uploader = new SwissTransferUploader({
      duration: 1,
      numberOfDownload: 1,
      password: 'password',
    });
    uploader.on('requestError', e => console.log(e.request?.requestUrl, e.response?.body));
    const files = fs.readdirSync(srcPath).map(file => path.join(srcPath, file));
    uploader.addFiles(...files);
    uploadResponse = await uploader.upload();
  }).timeout(0);

  it('should download some files', async () => {
    const {linkUUID} = uploadResponse[0];
    const downloader = new SwissTransferDownloader({
      linkUUID,
      password: 'password',
    });
    await downloader.download(dstPath);
  }).timeout(0);
});
