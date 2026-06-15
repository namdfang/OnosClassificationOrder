import type { UploadFileDto, UploadImageDto } from 'shared';
import { callApi } from '../apis';

const uploadImage = (query: string, body: UploadImageDto) => {
  return callApi(`/v1/upload/image${query}`, 'post', body, 'upload');
};

const uploadFile = (body: UploadFileDto) => {
  return callApi('/v1/upload/file', 'post', body, 'upload');
};

export const upload = {
  uploadImage,
  uploadFile,
};
