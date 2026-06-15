export const isCSV = (fileContent: string): boolean => {
  const rows = fileContent.split('\n');

  if (rows.length === 0) {
    return false;
  }

  for (const row of rows) {
    if (row.split(',').length > 1) {
      return true;
    }
  }

  return false;
};
