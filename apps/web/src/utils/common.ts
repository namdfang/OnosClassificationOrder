import axios from 'axios';

export const formatNumber = (str: string) => {
  if (str === undefined || str === null) return '';
  const strFormat = str.toString().replace(/[A-Za-z`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/g, '');
  if (Number(strFormat) >= 1000) {
    return strFormat
      .split('')
      .reverse()
      .reduce((prev, next, index) => {
        return (index % 3 ? next : `${next}.`) + prev;
      });
  }
  if (Number(strFormat) >= 0 && Number(strFormat) < 1000) {
    return Number(strFormat);
  }

  return '';
};

export const getPathByIndex = (index: number) => {
  if (!import.meta.env.VITE_PROD) {
    index -= 1;
  }
  const path = window.location.pathname;
  const parts = path.split('/');

  if (index >= 0 && index < parts.length) {
    return parts[index];
  }

  return '';
};

export const format = (number: number) => {
  const num = Number(number);

  return num.toLocaleString('vi-VN', {
    style: 'currency',
    currency: 'VND',
  });
};

export const upperCaseFistChar = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// style: currency, percent
export const IntlNumberFormat = (currency: string, style: string, maximumSignificantDigits: number, number: number) => {
  return new Intl.NumberFormat(currency, {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    style: `${style}`,
    currency: `${currency}`,
    maximumSignificantDigits,
  }).format(number);
};

export const removeDuplicates = (array: any[], keySelector: string) => {
  const cachedObject: { [key: string]: any } = {};
  array.forEach((item) => (cachedObject[item[keySelector]] = item));
  array = Object.values(cachedObject);

  return array;
};

export const flatMapArray = (array1: any[], array2: any[]) => {
  return array1.flatMap((item1) =>
    array2.map((item2) => ({
      data: [{ value_name: item1 }, { value_name: item2 }],
    })),
  );
};

export const UniqueItem = (data: any, key: string) => {
  return [...new Set(data.map((item: any) => item[key]))];
};

export const UniqueItemFullAttribute = (data: any) => {
  const uniqueSet = new Set(data.map((item: any) => JSON.stringify(item)));
  const uniqueArray = Array.from(uniqueSet).map((item: any) => JSON.parse(item));

  return uniqueArray;
};

// transform to Title Case
export const toTitleCase = (str: string) => {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Thêm khoảng trắng giữa chữ thường và chữ hoa (camelCase)
    .replace(/[_-]+/g, ' ') // Thay dấu gạch ngang và gạch dưới bằng khoảng trắng
    .toLowerCase() // Chuyển toàn bộ chuỗi về chữ thường
    .split(' ') // Tách chuỗi thành các từ bằng khoảng trắng
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1)) // Viết hoa chữ cái đầu của mỗi từ
    .join(' '); // Ghép các từ lại với nhau bằng khoảng trắng
};

export const downloadUrl = async (url: string, fileName: string) => {
  const response = await axios.get(url, { responseType: 'blob' });
  const blobUrl = window.URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;

  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(blobUrl);
};

export const parseParams = (params: Record<string, string>) => {
  for (const param in params) {
    if (
      params[param] === undefined /* In case of undefined assignment */ ||
      params[param] === null ||
      params[param] === ''
    ) {
      delete params[param];
    }
  }

  const qs = new URLSearchParams(params).toString();

  return qs;
};
