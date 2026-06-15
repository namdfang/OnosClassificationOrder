export const toCamelCase = (input: string): string =>
  input.toLowerCase().replaceAll(/[^\dA-Za-z]+(.)/g, (_, chr) => chr.toUpperCase());
