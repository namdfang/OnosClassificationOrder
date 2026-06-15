export const validateEmail = (email: string) => {
  if (email === '') return true;

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return regex.test(email);
};

export const validatePhoneNumber = (phoneNumber: string) => {
  const regex = /^\+?[0-9]{10}$/;

  return regex.test(phoneNumber);
};

export const validateReferralPhoneNumber = (referralPhoneNumber: string) => {
  if (referralPhoneNumber === '') return true;
  const regex = /^\+?[0-9]{10,15}$/;

  return regex.test(referralPhoneNumber);
};

export const validatePassword = (password: string) => {
  if (!password || password.length < 6) return false;

  return true;
};

// validate length longer than 50
export const validateName = (name: string) => {
  if (name.length > 40) {
    return 'Tên không được vượt quá 50 ký tự';
  }

  return null;
};

export const maskEmail = (email: string) => {
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email;

  const namePart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex);

  if (namePart.length <= 2) return email;

  const maskedNamePart = namePart[0] + '*'.repeat(namePart.length - 2) + namePart[namePart.length - 1];
  const maskedEmail = maskedNamePart + domainPart;

  return maskedEmail;
};
