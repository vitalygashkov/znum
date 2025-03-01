export const getTextBetween = (source, startStr, endStr) =>
  source?.split(startStr)?.[1]?.split(endStr)?.[0];

export const getPageUrl = (contentId, pageNumber) =>
  `https://znanium.ru/read/page?doc=${contentId}&page=${pageNumber}&current=${pageNumber}&d=&t=png`;
