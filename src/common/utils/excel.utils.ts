export const excelDateToJSDate = (serial: number): Date => {
  // Excel considera 1/1/1900 como día 1
  const utc_days = Math.floor(serial - 25569); // 25569 = días entre 1/1/1900 y 1/1/1970
  const utc_value = utc_days * 86400; // segundos
  return new Date(utc_value * 1000);
};
