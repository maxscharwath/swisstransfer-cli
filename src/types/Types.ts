export type IsPasswordValid = {
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
    deletedDate?: any;
    swiftVersion: number;
    downloadLimit: number;
    source: string;
    WSUser?: any;
    files: {
      containerUUID: string;
      UUID: string;
      fileName: string;
      fileSizeInBytes: number;
      downloadCounter: number;
      createdDate: string;
      expiredDate: string;
      deletedDate?: any;
      mimeType: string;
      receivedSizeInBytes: number;
    }[];
  };
};

export type ContainerSettings = {
  duration: number;
  authorEmail: string;
  password: string; // PASSWORD NEED TO BE MORE THAN 6 CHARACTERS
  message: string;
  numberOfDownload: number;
  lang: string;
  recipientsEmails: string;
};

export type RequestContainer = ContainerSettings & {
  sizeOfUpload: number;
  numberOfFile: number;
  recaptcha: string;
  files: string;
};

export type ResponseContainer = {
  container: {
    UUID: string;
    duration: number;
    downloadLimit: number;
    lang: string;
    source: string;
    WSUser?: any;
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
