export function getDayRange(date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
}

/**
 * Ejemplo: offsetDays = -1 => ayer, 0 => hoy, 1 => mañana
 */
export function getDateOffsetRange(offsetDays: number) {
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + offsetDays);
  return getDayRange(baseDate);
}
