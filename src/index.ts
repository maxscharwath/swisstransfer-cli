import axios, {AxiosResponse} from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';
import {Stream} from 'stream';
import {
  IsPasswordValid,
  RequestContainer,
  ResponseComplete,
  ResponseContainer,
} from './types/Types';
import * as path from 'path';

function downloadAllFiles(UUID: string) {
  const data = new FormData();
  data.append('linkUUID', UUID);
  axios({
    url: 'https://www.swisstransfer.com/api/isPasswordValid',
    data: FormData,
    headers: {
      'User-Agent': 'swisstransfer-webext/1.0',
      'Content-Length': '' + data.getLengthSync(),
      ...data.getHeaders(),
    },
  })
    .then((response: AxiosResponse<IsPasswordValid>) => {
      response.data.container.files.forEach(element => {
        element.UUID;
        axios
          .get<Stream>(
            `https://dl-nd365nkd.swisstransfer.com/api/download/${UUID}/${element.UUID}`,
            {
              responseType: 'stream',
              headers: {
                'User-Agent': 'swisstransfer-webext/1.0',
              },
            }
          )
          .then(response => {
            console.log(`Download ${element.fileName}`);
            response.data.pipe(
              fs.createWriteStream(`./dist/${element.fileName}`)
            );
          })
          .catch(err => {
            console.log(err);
            console.log(`Error ${element.fileName}`);
          });
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
  const response = await axios.post<
    RequestContainer,
    AxiosResponse<ResponseContainer>
  >(
    'https://www.swisstransfer.com/api/containers',
    {
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
    {
      responseType: 'json',
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
      },
    }
  );
  await Promise.all(
    response.data.filesUUID.map(
      (file, index) =>
        new Promise<AxiosResponse[]>(resolve => {
          const stream = fs.createReadStream(filesPath[index], {
            highWaterMark: MAX_BODY_LENGTH,
          });
          const chunks: Promise<AxiosResponse>[] = [];
          stream.on('data', async chunk => {
            const done = chunk.length < stream.readableHighWaterMark;
            const part =
              Math.ceil(stream.bytesRead / stream.readableHighWaterMark) - 1;
            chunks.push(
              axios.post(
                `https://${response.data.uploadHost}/api/uploadChunk/${
                  response.data.container.UUID
                }/${file}/${part}/${done ? 1 : 0}`,
                chunk,
                {
                  maxBodyLength: MAX_BODY_LENGTH,
                  responseType: 'json',
                  headers: {
                    'User-Agent': 'swisstransfer-webext/1.0',
                  },
                }
              )
            );
          });
          stream.on('end', async () => {
            resolve(await Promise.all(chunks));
            console.log(filesPath[index]);
          });
        })
    )
  );
  const data = new FormData();
  data.append('UUID', response.data.container.UUID);
  data.append('lang', 'fr_CH');
  return axios.post<FormData, AxiosResponse<ResponseComplete[]>>(
    'https://www.swisstransfer.com/api/uploadComplete',
    data,
    {
      responseType: 'json',
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
        'Content-Length': '' + data.getLengthSync(),
        ...data.getHeaders(),
      },
    }
  );
}
uploadFiles([
  path.join(__dirname, '../tmp/big.zip'),
  path.join(__dirname, '../tmp/cervin.jpg'),
]).then(response => {
  response.data.forEach(link => {
    console.log(`https://www.swisstransfer.com/d/${link.linkUUID}`);
  });
});
