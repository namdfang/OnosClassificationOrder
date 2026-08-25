import { initReactI18next } from 'react-i18next';
import i18n from 'i18next';

import agentApiEn from './locales/en/agentApi.json';
import authEn from './locales/en/auth.json';
import careersEn from './locales/en/careers.json';
import catalogEn from './locales/en/catalog.json';
import commonEn from './locales/en/common.json';
import customerFactoryAssignmentEn from './locales/en/customerFactoryAssignment.json';
import customerNotificationsEn from './locales/en/customerNotifications.json';
import customerPortalEn from './locales/en/customerPortal.json';
import customerPriorityEn from './locales/en/customerPriority.json';
import vnpShippingEn from './locales/en/vnpShipping.json';
import customersEn from './locales/en/customers.json';
import dashboardEn from './locales/en/dashboard.json';
import designerAutoAssignEn from './locales/en/designerAutoAssign.json';
import designerTaskWorkflowEn from './locales/en/designerTaskWorkflow.json';
import fulfillmentWorkflowEn from './locales/en/fulfillmentWorkflow.json';
import landingEn from './locales/en/landing.json';
import layoutEn from './locales/en/layout.json';
import orderLifecycleEn from './locales/en/orderLifecycle.json';
import orderLogEn from './locales/en/orderLog.json';
import ordersEn from './locales/en/orders.json';
import productsEn from './locales/en/products.json';
import promotionEn from './locales/en/promotion.json';
import scanErrorEn from './locales/en/scanError.json';
import stageErrorCatalogEn from './locales/en/stageErrorCatalog.json';
import toolCheckWorkflowEn from './locales/en/toolCheckWorkflow.json';
import workshopConfigEn from './locales/en/workshopConfig.json';
import agentApiVi from './locales/vi/agentApi.json';
import authVi from './locales/vi/auth.json';
import careersVi from './locales/vi/careers.json';
import catalogVi from './locales/vi/catalog.json';
import commonVi from './locales/vi/common.json';
import customerFactoryAssignmentVi from './locales/vi/customerFactoryAssignment.json';
import customerNotificationsVi from './locales/vi/customerNotifications.json';
import customerPortalVi from './locales/vi/customerPortal.json';
import customerPriorityVi from './locales/vi/customerPriority.json';
import vnpShippingVi from './locales/vi/vnpShipping.json';
import customersVi from './locales/vi/customers.json';
import dashboardVi from './locales/vi/dashboard.json';
import designerAutoAssignVi from './locales/vi/designerAutoAssign.json';
import designerTaskWorkflowVi from './locales/vi/designerTaskWorkflow.json';
import fulfillmentWorkflowVi from './locales/vi/fulfillmentWorkflow.json';
import landingVi from './locales/vi/landing.json';
import layoutVi from './locales/vi/layout.json';
import orderLifecycleVi from './locales/vi/orderLifecycle.json';
import orderLogVi from './locales/vi/orderLog.json';
import ordersVi from './locales/vi/orders.json';
import productsVi from './locales/vi/products.json';
import promotionVi from './locales/vi/promotion.json';
import scanErrorVi from './locales/vi/scanError.json';
import stageErrorCatalogVi from './locales/vi/stageErrorCatalog.json';
import toolCheckWorkflowVi from './locales/vi/toolCheckWorkflow.json';
import workshopConfigVi from './locales/vi/workshopConfig.json';

const STORAGE_KEY = 'onosfactory-language';

export type AppLanguage = 'vi' | 'en';

/** Ngôn ngữ mặc định toàn hệ thống khi người dùng chưa chọn gì. */
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

/**
 * Ngôn ngữ khởi động. Đọc THẲNG từ localStorage (không qua `languageStore`) vì
 * i18n phải init xong trước khi bất kỳ component nào render.
 * Chưa từng chọn ngôn ngữ → **tiếng Anh** (mặc định của hệ thống).
 */
export function getStoredLanguage(): AppLanguage {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return stored?.state?.language === 'vi' ? 'vi' : 'en';
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export const resources = {
  vi: {
    common: commonVi,
    auth: authVi,
    layout: layoutVi,
    dashboard: dashboardVi,
    orderLifecycle: orderLifecycleVi,
    orders: ordersVi,
    orderLog: orderLogVi,
    scanError: scanErrorVi,
    stageErrorCatalog: stageErrorCatalogVi,
    designerTaskWorkflow: designerTaskWorkflowVi,
    fulfillmentWorkflow: fulfillmentWorkflowVi,
    toolCheckWorkflow: toolCheckWorkflowVi,
    products: productsVi,
    promotion: promotionVi,
    workshopConfig: workshopConfigVi,
    designerAutoAssign: designerAutoAssignVi,
    customerFactoryAssignment: customerFactoryAssignmentVi,
    customers: customersVi,
    customerPriority: customerPriorityVi,
    vnpShipping: vnpShippingVi,
    customerPortal: customerPortalVi,
    customerNotifications: customerNotificationsVi,
    landing: landingVi,
    careers: careersVi,
    catalog: catalogVi,
    agentApi: agentApiVi,
  },
  en: {
    common: commonEn,
    auth: authEn,
    layout: layoutEn,
    dashboard: dashboardEn,
    orderLifecycle: orderLifecycleEn,
    orders: ordersEn,
    orderLog: orderLogEn,
    scanError: scanErrorEn,
    stageErrorCatalog: stageErrorCatalogEn,
    designerTaskWorkflow: designerTaskWorkflowEn,
    fulfillmentWorkflow: fulfillmentWorkflowEn,
    toolCheckWorkflow: toolCheckWorkflowEn,
    products: productsEn,
    promotion: promotionEn,
    workshopConfig: workshopConfigEn,
    designerAutoAssign: designerAutoAssignEn,
    customerFactoryAssignment: customerFactoryAssignmentEn,
    customers: customersEn,
    customerPriority: customerPriorityEn,
    vnpShipping: vnpShippingEn,
    customerPortal: customerPortalEn,
    customerNotifications: customerNotificationsEn,
    landing: landingEn,
    careers: careersEn,
    catalog: catalogEn,
    agentApi: agentApiEn,
  },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: getStoredLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: Object.keys(resources.vi),
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
