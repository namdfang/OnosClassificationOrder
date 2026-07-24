import type { UploadFileDto } from 'shared';

import { callApi } from '../apis';

/** `formData` phải có field `type` (ImageType) + `file` (File) — multipart/form-data. */
const uploadImage = (formData: FormData) => {
  return callApi('/v1/upload/image', 'post', formData, 'upload');
};

const uploadFile = (body: UploadFileDto) => {
  return callApi('/v1/upload/file', 'post', body, 'upload');
};

export const upload = {
  uploadImage,
  uploadFile,
};
