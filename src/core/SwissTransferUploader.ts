import * as fs from 'fs';
import * as path from 'path';
import got, {CancelableRequest, Got, Progress, RequestError, Response} from 'got';
import {EventEmitter} from './Event';

type UploaderConfig = {
  duration: 1 | 7 | 15 | 30;
  authorEmail: string;
  password: string; // PASSWORD NEED TO BE MORE THAN 6 CHARACTERS
  message: string;
  numberOfDownload: 1 | 20 | 100 | 200 | 250;
  lang: 'fr_FR' | 'en_GB' | 'it_IT' | 'es_ES' | 'de_DE';
  recipientsEmails: string;
};

type RequestContainer = UploaderConfig & {
  sizeOfUpload: number;
  numberOfFile: number;
  recaptcha: string;
  files: string;
};

type ResponseContainer = {
  container: {
    UUID: string;
    duration: number;
    downloadLimit: number;
    lang: string;
    source: string;
    WSUser?: string;
    authorIP: string;
    swiftVersion: string;
    createdDate: {
      date: string;
      timezone_type: number;
      timezone: string;
    };
    expiredDate: string;
    needPassword: boolean;
    numberOfFile: number;
  };
  uploadHost: string;
  filesUUID: string[];
};

export type ResponseComplete = {
  linkUUID: string;
  containerUUID: string;
  userEmail?: string;
  downloadCounterCredit: number;
  createdDate: string;
  expiredDate: string;
  isDownloadOnetime: number;
  isMailSent: number;
};

export type ProgressData<T extends {} = {}> = Progress & T;
export type ProgressChildren<T extends {} = {}> = ProgressData<T> & {
  children?: ProgressChildren<T>[];
};

type File = {
  uploadProgress: ProgressData<{name: string}>[];
  path: string;
  stat: fs.Stats;
  meta: {
    name: string;
    size: number;
  };
};

export default class SwissTransferUploader extends EventEmitter<{
  uploadProgress: () => ProgressChildren<{name: string}>;
  fileChunkUploaded: File & {part: number};
  fileUploaded: File;
  addFile: File;
  addFileError: {
    filePath: string;
    error: Error;
  };
  requestError: RequestError;
  done: ResponseComplete[];
}> {
  static readonly HOSTNAME = 'https://www.swisstransfer.com';
  static readonly CHUNK_SIZE = 50 * 1024 * 1024;
  static readonly MAX_UPLOAD_SIZE = 50 * 1024 * 1024 * 1024;
  readonly #config: UploaderConfig;
  readonly #client: Got;
  #files: File[] = [];
  #allFilesProcessing: Promise<PromiseSettledResult<File>[]>[] = [];

  constructor(config: Partial<UploaderConfig> = {}) {
    super();
    if (config.password && config.password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }
    this.#config = {
      authorEmail: '',
      duration: 7,
      lang: 'en_GB',
      message: '',
      numberOfDownload: 20,
      password: '',
      recipientsEmails: '[]',
      ...config,
    };
    this.#client = got.extend({
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
      },
      hooks: {
        beforeError: [
          error => {
            this.emit('requestError', error);
            return error;
          },
        ],
      },
      prefixUrl: SwissTransferUploader.HOSTNAME,
    });
  }

  static #progressMean<T extends {} = {}>(progresses: ProgressChildren<T>[]): ProgressChildren<T> {
    const result = progresses.reduce(
      (p, c) => {
        return {
          total: p.total + (c.total ?? 0),
          transferred: p.transferred + c.transferred,
        };
      },
      {
        total: 0,
        transferred: 0,
      }
    );
    return {
      children: progresses,
      ...result,
      percent: result.transferred / result.total || 0,
    } as ProgressChildren<T>;
  }

  public addFiles(...filesPath: string[]) {
    const filesProcessing: Promise<PromiseSettledResult<File>[]> = Promise.allSettled(
      filesPath.map(filePath => {
        return this.#processFile(filePath)
          .then(file => {
            this.#files.push(file);
            this.emit('addFile', file);
            return file;
          })
          .catch(error => {
            this.emit('addFileError', {
              error,
              filePath: filePath,
            });
            return error;
          });
      })
    );
    this.#allFilesProcessing.push(filesProcessing);
  }

  public async upload(): Promise<ResponseComplete[]> {
    await Promise.allSettled(this.#allFilesProcessing).finally(() => (this.#allFilesProcessing = []));
    if (this.#files.length === 0) {
      throw new Error('Add at least one file');
    }
    const {body: containerResponse} = await this.#client.post<ResponseContainer>('api/containers', {
      json: <RequestContainer>{
        ...this.#config,
        files: JSON.stringify(this.#files.map(f => f.meta)),
        numberOfFile: this.#files.length,
        recaptcha: 'nope',
        sizeOfUpload: this.#getUploadSize(),
      },
      responseType: 'json',
    });

    await Promise.all(
      containerResponse.filesUUID.map(async (fileUUID, index) => {
        const file = this.#files[index];
        const fileSize = file.stat.size;
        const nbChunks = Math.ceil(fileSize / SwissTransferUploader.CHUNK_SIZE);
        const chunks: CancelableRequest<Response<string>>[] = [];
        for (let i = 0; i < nbChunks; ++i) {
          const start = i * SwissTransferUploader.CHUNK_SIZE;
          const done = start + SwissTransferUploader.CHUNK_SIZE >= fileSize;
          const end = done ? fileSize : start + SwissTransferUploader.CHUNK_SIZE;
          chunks.push(
            this.#client
              .post<string>(`api/uploadChunk/${containerResponse.container.UUID}/${fileUUID}/${i}/${done ? 1 : 0}`, {
                body: fs.createReadStream(file.path, {
                  end,
                  start,
                }),
                headers: {
                  'Content-Length': `${end - start}`,
                },
                prefixUrl: `https://${containerResponse.uploadHost}`,
                responseType: 'json',
              })
              .on('uploadProgress', p => {
                file.uploadProgress[i] = {...p, name: `${file.meta.name} - part ${i}`};
                this.emit('uploadProgress', this.getUploadProgress.bind(this));
              })
              .on('response', () => {
                this.emit('fileChunkUploaded', {...file, part: i});
              })
          );
        }
        await Promise.all(chunks);
        this.emit('fileUploaded', file);
      })
    );

    const {body} = await this.#client.post<ResponseComplete[]>('api/uploadComplete', {
      json: {
        UUID: containerResponse.container.UUID,
        lang: this.#config.lang,
      },
      responseType: 'json',
    });
    this.emit('done', body);
    return body;
  }

  public getUploadProgress(): ProgressChildren<{name: string}> {
    return SwissTransferUploader.#progressMean(
      this.#files.map(file => ({
        ...SwissTransferUploader.#progressMean(file.uploadProgress),
        name: file.meta.name,
      }))
    );
  }

  async #processFile(filePath: string) {
    const fileStat = await fs.promises.stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error('Must be a file');
    }
    if (this.#getUploadSize() + fileStat.size > SwissTransferUploader.MAX_UPLOAD_SIZE) {
      throw new Error('Max upload size exceeded');
    }
    return {
      meta: {
        name: path.basename(filePath),
        size: fileStat.size,
      },
      path: filePath,
      stat: fileStat,
      uploadProgress: [],
    };
  }

  #getUploadSize(): number {
    return this.#files.reduce((prev, curr) => prev + curr.stat.size, 0);
  }
}
