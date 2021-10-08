import SwissTransferUploader, {ResponseComplete} from '../src/core/SwissTransferUploader';
import * as path from 'path';
import * as fs from 'fs';
import SwissTransferDownloader from '../src/core/SwissTransferDownloader';

async function generateFile(filePath: string, size: number) {
  if (size < 0) throw new Error("a negative size doesn't make any sense");
  await fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const fd = fs.openSync(filePath, 'w');
  await new Promise<void>((resolve, reject) => {
    fs.write(fd, Buffer.alloc(1), 0, 1, size - 1, error => {
      if (error) return reject(error);
      fs.close(fd, err => {
        if (err) return reject(err);
        return resolve();
      });
    });
  });
  console.log(`\t File "${path.basename(filePath)}" generated`);
}

describe('SwissTransfer', () => {
  const srcPath = path.join(__dirname, './srcFiles');
  const dstPath = path.join(__dirname, './dstFiles');
  before(async () => {
    console.log('Clear temp folders');
    await fs.promises.rm(path.join(srcPath), {force: true, recursive: true});
    await fs.promises.rm(path.join(dstPath), {force: true, recursive: true});
    console.log('Create dummy files');
    await Promise.all([
      generateFile(path.join(srcPath, './1MB.dat'), 1024 * 1024),
      generateFile(path.join(srcPath, './10MB.dat'), 10 * 1024 * 1024),
      generateFile(path.join(srcPath, './50MB.dat'), 50 * 1024 * 1024),
      generateFile(path.join(srcPath, './100MB.dat'), 100 * 1024 * 1024),
    ]);
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
      numberOfDownload: 20,
      password: 'password',
    });
    uploader.on('requestError', e => console.error(e.request?.requestUrl, e.response?.statusCode, e.response?.body));
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
    downloader.on('requestError', e => console.error(e.request?.requestUrl, e.response?.statusCode, e.response?.body));
    await downloader.download(dstPath);
  }).timeout(0);
});
