export const DEVICE_COOKIE = "thg-device";
export const DEVICE_MOBILE = "mobile";
export const DEVICE_DESKTOP = "desktop";

const MOBILE_UA_REGEX =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;

export function isMobileUserAgent(ua: string): boolean {
  return MOBILE_UA_REGEX.test(ua);
}
