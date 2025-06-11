export const getTextBetween = (source, startStr, endStr) =>
  source?.split(startStr)?.[1]?.split(endStr)?.[0];
