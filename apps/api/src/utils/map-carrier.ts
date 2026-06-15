export const mapCarrier = (carrier: string) => {
  if (carrier.toUpperCase() === 'DHL_ECOMMERCE') {
    return 'DHL';
  } else if (carrier.toUpperCase() === 'UPS_MAIL_INNOVATIONS') {
    return 'UPS';
  }

  return carrier;
};
