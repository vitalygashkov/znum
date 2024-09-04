export const login: (username: string, password: string) => Promise<void>;

export const fetchDocumentInfo: (documentUrl: string) => Promise<{
  pagesCount: number;
  cryptoKey: string;
  cryptoKeyId: string;
}>;

export const fetchPage: (
  contentId: string,
  pageNumber: number,
  token: string
) => Promise<{
  statusText: string;
  slices: Buffer[];
  statusCode: number;
}>;

export const downloadImages: (
  dir: string,
  documentId: string,
  { pagesCount: number, cryptoKey: string, cryptoKeyId: string }
) => Promise<string[]>;

export const convertImagesToPdf: (images: string[], output: string) => Promise<void>;
