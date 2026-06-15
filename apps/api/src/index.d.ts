import type { CookieJar } from 'tough-cookie';

declare module 'axios' {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface AxiosRequestConfig {
    jar?: CookieJar;
  }
}
