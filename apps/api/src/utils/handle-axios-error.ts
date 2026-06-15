import { AxiosError } from 'axios';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleAxiosError = (error: any) => {
  if (error instanceof AxiosError) {
    return error.response?.data?.message || 'Unknown error occurred!';
  }

  return error?.message || 'Unknown error occurred!';
};
