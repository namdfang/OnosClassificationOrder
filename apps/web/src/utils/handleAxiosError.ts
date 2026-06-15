import axios, { AxiosError, HttpStatusCode } from 'axios';
import { toast } from 'sonner';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const handleAxiosError = (error: any) => {
  if (axios.isAxiosError(error)) {
    if (error?.response?.status === HttpStatusCode.Forbidden) {
      toast.error('Forbidden');
    } else {
      toast.error(error?.response?.data?.message || error?.message || 'Unknown error occurred!');
    }
  }

  if (error instanceof AxiosError) {
    return error.response?.data?.message || 'Unknown error occurred!';
  }

  return error?.message || 'Unknown error occurred!';
};
