import * as FormData from 'form-data';
import * as fs from 'fs';
import {
  IsPasswordValid,
  ResponseComplete,
  ResponseContainer,
} from './types/Types';
import * as path from 'path';
import got, {CancelableRequest, Response} from 'got';

function downloadAllFiles(UUID: string, dist: string) {
  const body = new FormData();
  body.append('linkUUID', UUID);
  got
    .post<IsPasswordValid>(
      'https://www.swisstransfer.com/api/isPasswordValid',
      {
        body,
        responseType: 'json',
        headers: {
          'User-Agent': 'swisstransfer-webext/1.0',
          'Content-Length': '' + body.getLengthSync(),
          ...body.getHeaders(),
        },
      }
    )
    .then(response => {
      response.body.container.files.forEach(element => {
        element.UUID;
        got.stream
          .get(
            `https://dl-nd365nkd.swisstransfer.com/api/download/${UUID}/${element.UUID}`,
            {
              headers: {
                'User-Agent': 'swisstransfer-webext/1.0',
              },
            }
          )
          .on('downloadProgress', progress => {})
          .pipe(fs.createWriteStream(path.join(dist, element.fileName)));
      });
    })
    .catch(error => {
      console.log('error', error);
    });
}

async function uploadFiles(filesPath: string[]) {
  const MAX_BODY_LENGTH = 50 * 1024 * 1024; // 50MO
  console.log(filesPath);
  const files = await Promise.all(
    filesPath.map(async file => {
      const stat = await fs.promises.stat(file);
      return {
        name: path.basename(file),
        size: stat.size,
      };
    })
  );
  const response = await got.post<ResponseContainer>(
    'https://www.swisstransfer.com/api/containers',
    {
      json: {
        authorEmail: '',
        duration: 30,
        files: JSON.stringify(files),
        lang: 'fr_CH',
        message: '',
        numberOfDownload: 200,
        numberOfFile: files.length,
        password: '',
        recaptcha: 'nope',
        recipientsEmails: '[]',
        sizeOfUpload: files.reduce(
          (prevValue, currValue) => prevValue + currValue.size,
          0
        ),
      },
      responseType: 'json',
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
      },
    }
  );
  await Promise.all(
    response.body.filesUUID.map(
      (file, index) =>
        new Promise<Response<string>[]>(resolve => {
          const stream = fs.createReadStream(filesPath[index], {
            highWaterMark: MAX_BODY_LENGTH,
          });
          const chunks: CancelableRequest<Response<string>>[] = [];
          stream.on('data', async chunk => {
            const done = chunk.length < stream.readableHighWaterMark;
            const part =
              Math.ceil(stream.bytesRead / stream.readableHighWaterMark) - 1;
            chunks.push(
              got
                .post<string>(
                  `https://${response.body.uploadHost}/api/uploadChunk/${
                    response.body.container.UUID
                  }/${file}/${part}/${done ? 1 : 0}`,
                  {
                    body: chunk,
                    responseType: 'json',
                    headers: {
                      'User-Agent': 'swisstransfer-webext/1.0',
                    },
                  }
                )
                .on('response', () => {
                  console.log(filesPath[index], part);
                })
            );
          });
          stream.on('end', async () => {
            resolve(await Promise.all(chunks));
            console.log(filesPath[index]);
          });
        })
    )
  );
  const body = new FormData();
  body.append('UUID', response.body.container.UUID);
  body.append('lang', 'fr_CH');
  return got.post<ResponseComplete[]>(
    'https://www.swisstransfer.com/api/uploadComplete',
    {
      body,
      responseType: 'json',
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
        'Content-Length': '' + body.getLengthSync(),
        ...body.getHeaders(),
      },
    }
  );
}
uploadFiles([
  path.join(__dirname, '../tmp/big.zip'),
  path.join(__dirname, '../tmp/cervin.jpg'),
]).then(response => {
  response.body.forEach(link => {
    console.log(`https://www.swisstransfer.com/d/${link.linkUUID}`);
    downloadAllFiles(link.linkUUID, path.join(__dirname, '../dist'));
  });
});
