export const getTextBetween = (source, startStr, endStr) => source?.split(startStr)?.[1]?.split(endStr)?.[0];

export const getPageUrl = (contentId, pageNumber) =>
  `https://znanium.ru/read2/page?doc=${contentId}&pgnum=${pageNumber}&currnum=${pageNumber}&rotate=0`;
