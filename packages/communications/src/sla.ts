export interface ServiceLevel {
  enabled: boolean;
  timezone: string;
  working_days: number[];
  workday_start: string;
  workday_end: string;
  first_response_minutes: number;
  escalation_minutes: number;
}

export const defaultServiceLevel: ServiceLevel = {
  enabled: true,
  timezone: "Europe/Moscow",
  working_days: [1, 2, 3, 4, 5, 6, 7],
  workday_start: "10:00",
  workday_end: "20:00",
  first_response_minutes: 10,
  escalation_minutes: 15,
};

type LocalTime = { year: number; month: number; day: number; hour: number; minute: number };

const formatter = (timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

function localParts(value: Date, timezone: string): LocalTime & { second: number } {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function utcForLocal(value: LocalTime, timezone: string) {
  const desired = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute);
  let result = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = localParts(new Date(result), timezone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const next = result + desired - represented;
    if (next === result) break;
    result = next;
  }
  return new Date(result);
}

function clock(value: string) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) throw new Error("INVALID_SERVICE_LEVEL_CLOCK");
  const hour = Number(match[1]),
    minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("INVALID_SERVICE_LEVEL_CLOCK");
  return hour * 60 + minute;
}

function nextDate(value: LocalTime) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function isoWeekday(value: LocalTime) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day)).getUTCDay() || 7;
}

export function addWorkingMinutes(start: Date | string, minutes: number, level: ServiceLevel) {
  if (!Number.isInteger(minutes) || minutes < 0) throw new Error("INVALID_SERVICE_LEVEL_MINUTES");
  const days = new Set(level.working_days.map(Number));
  const dayStart = clock(level.workday_start),
    dayEnd = clock(level.workday_end);
  if (!days.size || [...days].some((day) => day < 1 || day > 7) || dayEnd <= dayStart)
    throw new Error("INVALID_SERVICE_LEVEL_SCHEDULE");
  let cursor = new Date(start);
  if (Number.isNaN(cursor.getTime())) throw new Error("INVALID_SERVICE_LEVEL_START");
  let remaining = minutes * 60_000;
  for (let guard = 0; guard < 370; guard += 1) {
    let local = localParts(cursor, level.timezone);
    const minuteOfDay = local.hour * 60 + local.minute;
    if (!days.has(isoWeekday(local)) || minuteOfDay >= dayEnd) {
      const date = nextDate(local);
      cursor = utcForLocal(
        { ...date, hour: Math.floor(dayStart / 60), minute: dayStart % 60 },
        level.timezone,
      );
      continue;
    }
    if (minuteOfDay < dayStart) {
      cursor = utcForLocal(
        { ...local, hour: Math.floor(dayStart / 60), minute: dayStart % 60 },
        level.timezone,
      );
      local = localParts(cursor, level.timezone);
    }
    const end = utcForLocal(
      { ...local, hour: Math.floor(dayEnd / 60), minute: dayEnd % 60 },
      level.timezone,
    );
    const available = Math.max(0, end.getTime() - cursor.getTime());
    if (remaining <= available) return new Date(cursor.getTime() + remaining);
    remaining -= available;
    const date = nextDate(local);
    cursor = utcForLocal(
      { ...date, hour: Math.floor(dayStart / 60), minute: dayStart % 60 },
      level.timezone,
    );
  }
  throw new Error("SERVICE_LEVEL_SCHEDULE_EXHAUSTED");
}

export function serviceDeadlines(start: Date | string, level: ServiceLevel = defaultServiceLevel) {
  if (!level.enabled) return { firstResponseDueAt: null, escalationDueAt: null };
  return {
    firstResponseDueAt: addWorkingMinutes(start, level.first_response_minutes, level),
    escalationDueAt: addWorkingMinutes(start, level.escalation_minutes, level),
  };
}
