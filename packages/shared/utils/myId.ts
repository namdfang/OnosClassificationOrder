import { customAlphabet } from 'nanoid';
import { ID_LENGTH } from '..';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const myId = (length = ID_LENGTH) => {
  const id = customAlphabet(alphabet, length)();

  return id;
};
