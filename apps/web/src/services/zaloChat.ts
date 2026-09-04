import { callApi } from '../apis';
import { CONFIG } from '../constants';

/**
 * Phiên cho màn chat Zalo. Chỉ có hai lời gọi — mọi thứ còn lại của module Zalo
 * do SDK của nhà cung cấp tự gọi thẳng `/api/zalo-multi/*` (không qua axios).
 */
const createSession = () => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-chat/session`, 'post', {});
};

const deleteSession = () => {
  return callApi(`/${CONFIG.API_VERSION}/zalo-chat/session`, 'delete');
};

export const zaloChat = { createSession, deleteSession };
