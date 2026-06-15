/* eslint-disable unicorn/better-regex */
export const PASSWORD_PATTERN =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*)(+=.<>{}/\\[\]:;'"|~`_-])[A-Za-z\d!@#$%^&*)(+=.<>{}/\\[\]:;'"|~`_-]{12,32}/;
export const EMAIL_PATTERN = /^\w+([.]?\w+)*@\w+([.-]?\w+)*(\.\w{2,8})+$/;
export const EMAIL_ZICTOK = /^[A-Za-z0-9]+([.-]?[A-Za-z0-9]+)*@zictok\.com$/;
