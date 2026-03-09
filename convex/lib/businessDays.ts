import { addDays, isWeekend, format } from "date-fns";
import { US_FEDERAL_HOLIDAYS } from "./holidayData";

const holidaySet = new Set(US_FEDERAL_HOLIDAYS.map((h) => h.date));

export function isHolidayStatic(date: Date): boolean {
  return holidaySet.has(format(date, "yyyy-MM-dd"));
}

export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isHolidayStatic(date);
}

export function addBusinessDays(startDate: Date, days: number): Date {
  let current = new Date(startDate);
  let remaining = days;
  while (remaining > 0) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) remaining--;
  }
  return current;
}

export function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  let current = new Date(start);
  while (current < end) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) count++;
  }
  return count;
}

export function nextBusinessDay(date: Date): Date {
  let current = new Date(date);
  while (!isBusinessDay(current)) {
    current = addDays(current, 1);
  }
  return current;
}
