import moment from 'moment';

export const formatDate = (date: string | number, format = 'DD/MM/YY HH:mm') => {
  const formattedDate = moment(date).format(format);

  return formattedDate;
};

export const formatDateOnly = (date: string | number, format = 'DD/MM/YY') => {
  const formattedDate = moment(date).format(format);

  return formattedDate;
};

export const formatGMT = (date: string) => {
  const formattedGMT = moment(date).toDate();

  return formattedGMT;
};

// chuyển đổi timestamp sang ngày tháng năm dạng YYYY/MM/DD hh:mm:aa
export const formatDateTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const amOrPm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = (hours % 12 || 12).toString(); // Đảm bảo giờ không vượt quá 12 và không bằng 0

  const formatted = `${year}/${month}/${day} ${formattedHours}:${minutes} ${amOrPm}`;

  return formatted;
};

export const formatToTimeStamp = (time: string) => {
  const timeConvert = new Date(time);
  const timestamp = timeConvert.getTime();

  return timestamp;
};
