import {EventEmitter} from './Event';
import got, {Got, Progress} from 'got';
import * as fs from 'fs';
import * as path from 'path';

type DownloaderConfig = {
  linkUUID: string;
  password?: string;
};

type File = {
  containerUUID: string;
  UUID: string;
  fileName: string;
  fileSizeInBytes: number;
  downloadCounter: number;
  createdDate: string;
  expiredDate: string;
  deletedDate?: string;
  mimeType: string;
  receivedSizeInBytes: number;
};

type IsPasswordValid = {
  linkUUID: string;
  containerUUID: string;
  userEmail: string;
  downloadCounterCredit: number;
  createdDate: string;
  expiredDate: string;
  isDownloadOnetime: number;
  isMailSent: number;
  container: {
    UUID: string;
    duration: number;
    authorEmail: string;
    authorIP: string;
    createdDate: string;
    expiredDate: string;
    numberOfFile: number;
    message: string;
    needPassword: number;
    lang: string;
    sizeUploaded: number;
    deletedDate?: string;
    swiftVersion: number;
    downloadLimit: number;
    source: string;
    WSUser?: string;
    files: File[];
  };
};

export default class SwissTransferDownloader extends EventEmitter<{
  downloadProgress: () => Required<Progress>;
}> {
  static readonly HOSTNAME = 'https://www.swisstransfer.com';

  readonly #config: Required<DownloaderConfig>;
  readonly #client: Got;

  static #progressMean(progresses: Progress[]): Required<Progress> {
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
      ...result,
      percent: result.transferred / result.total,
    };
  }

  constructor(config: DownloaderConfig) {
    super();
    this.#config = {
      password: '',
      ...config,
    };
    this.#client = got.extend({
      headers: {
        'User-Agent': 'swisstransfer-webext/1.0',
      },
      prefixUrl: SwissTransferDownloader.HOSTNAME,
    });
  }

  async #verifyPassword(): Promise<IsPasswordValid> {
    const {body} = await this.#client.post<IsPasswordValid | false>('api/isPasswordValid', {
      json: {
        linkUUID: this.#config.linkUUID,
        password: this.#config.password,
      },
      responseType: 'json',
    });
    if (!body) throw new Error('Wrong password');
    return body;
  }

  async #getFileToken(file: File): Promise<string> {
    const {body} = await this.#client.post<string>('api/generateDownloadToken', {
      json: {
        containerUUID: file.containerUUID,
        fileUUID: file.UUID,
        password: this.#config.password,
      },
      responseType: 'json',
    });
    return body;
  }

  public async download(dist: string) {
    const response = await this.#verifyPassword();

    if (response.downloadCounterCredit < 0) {
      throw new Error('The authorised number of downloads has been reached.');
    }
    if (Date.parse(response.expiredDate) < Date.now()) {
      throw new Error('This link has expired');
    }
    const downloadProgress: Progress[] = [];
    return Promise.allSettled(
      response.container.files.map(async (file: File, index) => {
        const token = response.container.needPassword ? await this.#getFileToken(file) : undefined;
        return new Promise(resolve => {
          this.#client.stream
            .get(`api/download/${this.#config.linkUUID}/${file.UUID}`, {
              searchParams: {
                token,
              },
            })
            .on('downloadProgress', progress => {
              if (!progress.total) return;
              downloadProgress[index] = progress;
              this.emit('downloadProgress', () => SwissTransferDownloader.#progressMean(downloadProgress));
            })
            .on('end', () => resolve(file))
            .pipe(fs.createWriteStream(path.join(dist, file.fileName)));
        });
      })
    );
  }
}
