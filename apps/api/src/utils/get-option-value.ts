export const getOptionValue = (options: string[], optionNames: string[], optionName: string) => {
  optionNames = optionNames.map((option) => option.toLowerCase());
  const optionIndex = optionNames.indexOf(optionName.toLowerCase());

  if (optionIndex === -1) {
    return null;
  }

  return options[optionIndex];
};
