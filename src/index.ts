import * as fs from 'fs';
import {
  ContainerSettings,
  IsPasswordValid,
  RequestContainer,
  ResponseComplete,
  ResponseContainer,
} from './types/Types';
import * as path from 'path';
import got, {CancelableRequest, Response} from 'got';

function downloadAllFiles(
  options: {linkUUID: string; password?: string},
  dist: string
) {
  got
    .post<IsPasswordValid | false>(
      'https://www.swisstransfer.com/api/isPasswordValid',
      {
        json: options,
        responseType: 'json',
        headers: {
          'User-Agent': 'swisstransfer-webext/1.0',
        },
      }
    )
    .then(response => {
      if (response.body === false) {
        console.log('wrong password');
        return;
      }
      return Promise.allSettled(
        response.body.container.files.map(async element => {
          const {body: token} = await got.post<string>(
            'https://www.swisstransfer.com/api/generateDownloadToken',
            {
              json: {
                password: options.password,
                containerUUID: element.containerUUID,
                fileUUID: element.UUID,
              },
              responseType: 'json',
              headers: {
                'User-Agent': 'swisstransfer-webext/1.0',
              },
            }
          );
          await new Promise<void>(resolve => {
            got.stream
              .get(
                `https://www.swisstransfer.com/api/download/${options.linkUUID}/${element.UUID}`,
                {
                  searchParams: {
                    token,
                  },
                  headers: {
                    'User-Agent': 'swisstransfer-webext/1.0',
                  },
                }
              )
              .on('downloadProgress', progress => {
                //console.log(progress.percent);
              })
              .on('end', () => {
                console.log(element.fileName);
                resolve();
              })
              .pipe(fs.createWriteStream(path.join(dist, element.fileName)));
          });
        })
      );
    })
    .then(() => console.log('download done'))
    .catch(error => {
      console.log('error', error);
    });
}

async function uploadFiles(
  filesPath: string[],
  config: Partial<ContainerSettings> = {}
) {
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
      json: <RequestContainer>{
        authorEmail: '',
        duration: 30,
        lang: 'fr_CH',
        message: '',
        numberOfDownload: 200,
        password: '',
        recipientsEmails: '[]',
        ...config,
        files: JSON.stringify(files),
        numberOfFile: files.length,
        recaptcha: 'nope',
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
  return got.post<ResponseComplete[]>(
    'https://www.swisstransfer.com/api/uploadComplete',
    {
      json: {
        UUID: response.body.container.UUID,
        lang: 'fr_CH',
      },
      responseType: 'json',
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
      },
    }
  );
}
uploadFiles([path.join(__dirname, '../tmp/cervin.jpg')]).then(response => {
  response.body.forEach(link => {
    console.log(`https://www.swisstransfer.com/d/${link.linkUUID}`);
    downloadAllFiles(
      {linkUUID: link.linkUUID},
      path.join(__dirname, '../dist')
    );
  });
});
