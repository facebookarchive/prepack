/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { NumberValue, Value, ObjectValue } from "../values/index.js";
import type { Realm } from "../realm.js";
import { To } from "../singletons.js";
import invariant from "../invariant.js";

// Constants
export const SecondsPerMinute = 60;
export const MinutesPerHour = 60;
export const HoursPerDay = 24;
export const msPerSecond = 1000;
export const msPerMinute = msPerSecond * SecondsPerMinute;
export const msPerHour = msPerMinute * MinutesPerHour;
export const msPerDay = msPerHour * HoursPerDay;

let LocalTZA = -new Date(0).getTimezoneOffset() * msPerMinute;

// ECMA262 20.3.1.2
export function Day(realm: Realm, t: number): number {
  return Math.floor(t / msPerDay);
}

// ECMA262 20.3.1.2
export function TimeWithinDay(realm: Realm, t: number): number {
  return t % msPerDay;
}

// ECMA262 20.3.1.3
export function DaysInYear(realm: Realm, y: number): 365 | 366 {
  if (y % 4 !== 0) return 365;
  if (y % 4 === 0 && y % 100 !== 0) return 366;
  if (y % 100 === 0 && y % 400 !== 0) return 365;
  if (y % 400 === 0) return 366;

  invariant(false, "Invalid condition");
}

// ECMA262 20.3.1.3
export function DayFromYear(realm: Realm, y: number): number {
  return 365 * (y - 1970) + Math.floor((y - 1969) / 4) - Math.floor((y - 1901) / 100) + Math.floor((y - 1601) / 400);
}

// ECMA262 20.3.1.3
export function TimeFromYear(realm: Realm, y: number): number {
  return msPerDay * DayFromYear(realm, y);
}

// ECMA262 20.3.1.3
export function YearFromTime(realm: Realm, t: number): number {
  let y = Math.floor(t / (msPerDay * 365.2425)) + 1970;
  let t2 = TimeFromYear(realm, y);

  if (t2 > t) {
    y--;
  } else {
    if (t2 + msPerDay * DaysInYear(realm, y) <= t) {
      y++;
    }
  }
  return y;
}

// ECMA262 20.3.1.3
export function InLeapYear(realm: Realm, t: number): number {
  let daysInYear = DaysInYear(realm, YearFromTime(realm, t));
  if (daysInYear === 365) return 0;
  if (daysInYear === 366) return 1;
  invariant(false, "invalid condition");
}

// ECMA262 20.3.1.4
export function MonthFromTime(realm: Realm, t: number): number {
  let step: ?number;
  let d = DayWithinYear(realm, t);

  if (d < (step = 31)) return 0;

  step += InLeapYear(realm, t) ? 29 : 28;
  if (d < step) return 1;
  if (d < (step += 31)) return 2;
  if (d < (step += 30)) return 3;
  if (d < (step += 31)) return 4;
  if (d < (step += 30)) return 5;
  if (d < (step += 31)) return 6;
  if (d < (step += 31)) return 7;
  if (d < (step += 30)) return 8;
  if (d < (step += 31)) return 9;
  if (d < (step += 30)) return 10;
  return 11;
}

// ECMA262 20.3.1.4
export function DayWithinYear(realm: Realm, t: number): number {
  return Day(realm, t) - DayFromYear(realm, YearFromTime(realm, t));
}

// ECMA262 20.3.1.5
export function DateFromTime(realm: Realm, t: number): number {
  let step: ?number;
  let next: ?number;
  let d = DayWithinYear(realm, t);

  if (d <= (next = 30)) return d + 1;

  step = next;
  next += InLeapYear(realm, t) ? 29 : 28;
  if (d <= next) return d - step;

  step = next;
  if (d <= (next += 31)) return d - step;

  step = next;
  if (d <= (next += 30)) return d - step;

  step = next;
  if (d <= (next += 31)) return d - step;

  step = next;
  if (d <= (next += 30)) return d - step;

  step = next;
  if (d <= (next += 31)) return d - step;

  step = next;
  if (d <= (next += 31)) return d - step;

  step = next;
  if (d <= (next += 30)) return d - step;

  step = next;
  if (d <= (next += 31)) return d - step;

  step = next;
  if (d <= (next += 30)) return d - step;

  step = next;
  return d - step;
}

// ECMA262 20.3.1.6
export function WeekDay(realm: Realm, t: number): number {
  return (Day(realm, t) + 4) % 7;
}

// ECMA262 20.3.1.7
export function DaylightSavingTA(realm: Realm, t: number): number {
  // TODO #1014: Implement DaylightSavingTA
  return 0;
}

// ECMA262 20.3.1.9
export function LocalTime(realm: Realm, t: number): number {
  // 1. Return t + LocalTZA + DaylightSavingTA(t).
  return t + LocalTZA + DaylightSavingTA(realm, t);
}

// ECMA262 20.3.1.10
export function UTC(realm: Realm, _t: number | Value): NumberValue {
  let t = _t;
  if (t instanceof Value) t = t.throwIfNotConcreteNumber().value;

  // 1. Return t - LocalTZA - DaylightSavingTA(t - LocalTZA).
  return new NumberValue(realm, (t: number) - LocalTZA - DaylightSavingTA(realm, (t: number) - LocalTZA));
}

// ECMA262 20.3.1.11
export function HourFromTime(realm: Realm, t: number): number {
  return Math.floor(t / msPerHour) % HoursPerDay;
}

// ECMA262 20.3.1.11
export function MinFromTime(realm: Realm, t: number): number {
  return Math.floor(t / msPerMinute) % MinutesPerHour;
}

// ECMA262 20.3.1.11
export function SecFromTime(realm: Realm, t: number): number {
  return Math.floor(t / msPerSecond) % SecondsPerMinute;
}

// ECMA262 20.3.1.11
export function msFromTime(realm: Realm, t: number): number {
  return t % msPerSecond;
}

// ECMA262 20.3.1.12
export function MakeTime(realm: Realm, hour: number, min: number, sec: number, ms: number): number {
  // 1. If hour is not finite or min is not finite or sec is not finite or ms is not finite, return NaN.
  if (!isFinite(hour) || !isFinite(min) || !isFinite(sec) || !isFinite(ms)) return NaN;

  // 2. Let h be ToInteger(hour).
  let h = To.ToInteger(realm, new NumberValue(realm, hour));

  // 3. Let m be ToInteger(min).
  let m = To.ToInteger(realm, new NumberValue(realm, min));

  // 4. Let s be ToInteger(sec).
  let s = To.ToInteger(realm, new NumberValue(realm, sec));

  // 5. Let milli be ToInteger(ms).
  let milli = To.ToInteger(realm, new NumberValue(realm, ms));

  // 6. Let t be h * msPerHour + m * msPerMinute + s * msPerSecond + milli, performing the arithmetic
  //    according to IEEE 754-2008 rules (that is, as if using the ECMAScript operators * and +).
  let t = h * msPerHour + m * msPerMinute + s * msPerSecond + milli;

  // 7. Return t.
  return t;
}

// ECMA262 20.3.1.13
export function MakeDay(realm: Realm, year: number, month: number, date: number): number {
  // 1. If year is not finite or month is not finite or date is not finite, return NaN.
  if (!isFinite(year) || !isFinite(month) || !isFinite(date)) return NaN;

  // 2. Let y be ToInteger(year).
  let y = To.ToInteger(realm, new NumberValue(realm, year));

  // 3. Let m be ToInteger(month).
  let m = To.ToInteger(realm, new NumberValue(realm, month));

  // 4. Let dt be ToInteger(date).
  let dt = To.ToInteger(realm, new NumberValue(realm, date));

  // 5. Let ym be y + floor(m / 12).
  let ym = y + Math.floor(m / 12);

  // 6. Let mn be m modulo 12.
  let mn = m < 0 ? (m % 12) + 12 : m % 12;

  // 7. Find a value t such that YearFromTime(t) is ym and MonthFromTime(t) is mn and DateFromTime(t) is 1;
  //    but if this is not possible (because some argument is out of range), return NaN.
  //    Inspired by the V8 implementation.
  if (Math.abs(ym) >= 1000000.0 || Math.abs(mn) >= 1000000.0) {
    return NaN;
  }
  const yearDelta = 399999;
  const baseDay =
    365 * (1970 + yearDelta) +
    Math.floor((1970 + yearDelta) / 4) -
    Math.floor((1970 + yearDelta) / 100) +
    Math.floor((1970 + yearDelta) / 400);
  let t =
    365 * (ym + yearDelta) +
    Math.floor((ym + yearDelta) / 4) -
    Math.floor((ym + yearDelta) / 100) +
    Math.floor((ym + yearDelta) / 400) -
    baseDay;

  if (ym % 4 !== 0 || (ym % 100 === 0 && ym % 400 !== 0)) {
    t += [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][mn];
  } else {
    t += [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335][mn];
  }

  // 8. Return Day(t) + dt - 1.
  return t + dt - 1;
}

// ECMA262 20.3.1.14
export function MakeDate(realm: Realm, day: number, time: number): number {
  // 1. If day is not finite or time is not finite, return NaN.
  if (!isFinite(day) || !isFinite(time)) return NaN;

  // 2. Return day × msPerDay + time.
  return day * msPerDay + time;
}

// ECMA262 20.3.1.15
export function TimeClip(realm: Realm, _time: number | Value): NumberValue {
  let time = _time;
  if (time instanceof Value) time = time.throwIfNotConcreteNumber().value;
  // 1. If time is not finite, return NaN.
  if (!isFinite(time)) return realm.intrinsics.NaN;

  // 2. If abs(time) > 8.64 × 10^15, return NaN.
  if (Math.abs((time: number)) > 8640000000000000) {
    return realm.intrinsics.NaN;
  }

  // 3. Let clippedTime be ToInteger(time).
  let clippedTime = To.ToInteger(realm, new NumberValue(realm, (time: number)));

  // 4. If clippedTime is -0, let clippedTime be +0.
  if (Object.is(clippedTime, -0)) clippedTime = +0;

  // 5. Return clippedTime.
  return new NumberValue(realm, clippedTime);
}

// ECMA262 20.3.4
export function thisTimeValue(realm: Realm, value: Value): Value {
  // 1. If Type(value) is Object and value has a [[DateValue]] internal slot, then
  if (value instanceof ObjectValue && value.$DateValue !== undefined) {
    // a. Return the value of value's [[DateValue]] internal slot.
    return value.$DateValue;
  }

  // 2. Throw a TypeError exception.
  throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
}

// ECMA262 20.3.4.41.1
export function ToDateString(realm: Realm, tv: number): string {
  // 1. Assert: Type(tv) is Number.
  invariant(typeof tv === "number", "expected tv to be a number");

  // 2. If tv is NaN, return "Invalid Date".
  if (isNaN(tv)) return "Invalid Date";

  // 3. Return an implementation-dependent String value that represents tv as a date and time in the current
  //    time zone using a convenient, human-readable form.
  return new Date(tv).toString();
}
