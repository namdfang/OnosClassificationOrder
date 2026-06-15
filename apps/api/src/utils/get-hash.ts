import crypto from 'crypto';

export const getHash = (data: string) => crypto.createHash('md5').update(data).digest('hex');
