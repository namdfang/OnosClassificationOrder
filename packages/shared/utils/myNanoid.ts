import { customAlphabet } from 'nanoid';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const myNanoid = (length = 21) => {
  const id = customAlphabet(alphabet, length)();

  return id;
};
