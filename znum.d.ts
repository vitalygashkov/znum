export class LoginError extends Error {}

export class NotAuthorizedError extends Error {}

export const login: (username?: string, password?: string) => Promise<void>;

export const fetchDocumentInfo: (documentUrl: string) => Promise<{
  pagesCount: number;
  cryptoKey: string;
  cryptoKeyId: string;
  syncTime: string;
  fontVariant: string;
}>;

export const fetchPage: (
  contentId: string,
  pageNumber: number,
  secret: {
    cryptoKey: string;
    cryptoKeyId: string;
    syncTime?: string;
    fontVariant?: string;
  }
) => Promise<{
  status: string;
  statusText: string;
  statusCode: number;
  slices: Buffer[];
  svg: string | null;
  decryptKey: string;
  body: string;
}>;

export const downloadImages: (
  dir: string,
  documentId: string,
  info: {
    pagesCount: number;
    cryptoKey: string;
    cryptoKeyId: string;
    syncTime?: string;
    fontVariant?: string;
  }
) => Promise<string[]>;

export const convertImagesToPdf: (images: string[], output: string) => Promise<void>;
