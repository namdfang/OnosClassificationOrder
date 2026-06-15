export const WebhookTopic = {
  OrderProcessing: 'Order Processing',
};

export type WebhookTopic = (typeof WebhookTopic)[keyof typeof WebhookTopic];
