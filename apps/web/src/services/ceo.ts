import { callApi } from '../apis';
import { CONFIG } from '../constants';

/** CEO Dashboard — `GET /v1/ceo/overview?from&to` (CeoDashboard.md), CHỈ SuperAdmin/Admin. */
const getOverview = (from: string, to: string) => {
  return callApi(`/${CONFIG.API_VERSION}/ceo/overview?from=${from}&to=${to}`, 'get');
};

const getReport = (from: string, to: string) => {
  return callApi(`/${CONFIG.API_VERSION}/ceo/report?from=${from}&to=${to}`, 'get');
};

/** Khởi chạy sinh nhận định (chạy NỀN ở BE, trả về ngay) — FE thăm dò `getReport` tới khi `generating=false`. */
const generateReport = (from: string, to: string) => {
  return callApi(`/${CONFIG.API_VERSION}/ceo/report/generate`, 'post', { from, to });
};

export const ceoDashboard = { getOverview, getReport, generateReport };
