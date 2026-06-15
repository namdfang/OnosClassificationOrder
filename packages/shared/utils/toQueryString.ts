import { undefined } from 'zod';

export function toQueryString(params: Record<string, string | string[] | number | boolean>) {
  const queryString =
    '?' +
    Object.keys(params)
      .filter(Boolean)
      .map((key) => {
        if (Array.isArray(params[key])) {
          console.log('params[key]', params[key]);
          return params[key].map((value) => `${key}=${encodeURIComponent(value)}`).join('&');
        } else {
          // @ts-expect-error key
          if (params[key] === '' || params.key === undefined) return false;

          // @ts-expect-error key
          return `${key}=${encodeURIComponent(params[key])}`;
        }
      })
      .filter(Boolean)
      .join('&');
  return queryString;
}
