(function() {

  var fbt = {
    _(x) {
      return x;
    }
  }

  global._DateFormatConfig = {
    numericDateOrder: ['m', 'd', 'y'],
    numericDateSeparator: '/',
    shortDayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    timeSeparator: ':',
    weekStart: 6,
    formats: {
      D: 'D',
      'D g:ia': 'D g:ia',
      'D M d': 'D M d',
      'D M d, Y': 'D M d, Y',
      'D M j': 'D M j',
      'D M j, y': 'D M j, y',
      'F d': 'F d',
      'F d, Y': 'F d, Y',
      'F g': 'F g',
      'F j': 'F j',
      'F j, Y': 'F j, Y',
      'F j, Y @ g:i A': 'F j, Y @ g:i A',
      'F j, Y g:i a': 'F j, Y g:i a',
      'F jS': 'F jS',
      'F jS, g:ia': 'F jS, g:ia',
      'F jS, Y': 'F jS, Y',
      'F Y': 'F Y',
      'g A': 'g A',
      'g:i': 'g:i',
      'g:i A': 'g:i A',
      'g:i a': 'g:i a',
      'g:iA': 'g:iA',
      'g:ia': 'g:ia',
      'g:ia F jS, Y': 'g:ia F jS, Y',
      'g:iA l, F jS': 'g:iA l, F jS',
      'g:ia M j': 'g:ia M j',
      'g:ia M jS': 'g:ia M jS',
      'g:ia, F jS': 'g:ia, F jS',
      'g:iA, l M jS': 'g:iA, l M jS',
      'g:sa': 'g:sa',
      'H:I - M d, Y': 'H:I - M d, Y',
      'h:i a': 'h:i a',
      'h:m:s m/d/Y': 'h:m:s m/d/Y',
      j: 'j',
      'l F d, Y': 'l F d, Y',
      'l g:ia': 'l g:ia',
      'l, F d, Y': 'l, F d, Y',
      'l, F j': 'l, F j',
      'l, F j, Y': 'l, F j, Y',
      'l, F jS': 'l, F jS',
      'l, F jS, g:ia': 'l, F jS, g:ia',
      'l, M j': 'l, M j',
      'l, M j, Y': 'l, M j, Y',
      'l, M j, Y g:ia': 'l, M j, Y g:ia',
      'M d': 'M d',
      'M d, Y': 'M d, Y',
      'M d, Y g:ia': 'M d, Y g:ia',
      'M d, Y ga': 'M d, Y ga',
      'M j': 'M j',
      'M j, Y': 'M j, Y',
      'M j, Y g:i A': 'M j, Y g:i A',
      'M j, Y g:ia': 'M j, Y g:ia',
      'M jS, g:ia': 'M jS, g:ia',
      'M Y': 'M Y',
      'M y': 'M y',
      'm-d-y': 'm-d-y',
      'M. d': 'M. d',
      'M. d, Y': 'M. d, Y',
      'j F Y': 'j F Y',
      'm.d.y': 'm.d.y',
      'm/d': 'm/d',
      'm/d/Y': 'm/d/Y',
      'm/d/y': 'm/d/y',
      'm/d/Y g:ia': 'm/d/Y g:ia',
      'm/d/y H:i:s': 'm/d/y H:i:s',
      'm/d/Y h:m': 'm/d/Y h:m',
      n: 'n',
      'n/j': 'n/j',
      'n/j, g:ia': 'n/j, g:ia',
      'n/j/y': 'n/j/y',
      Y: 'Y',
      'Y-m-d': 'Y-m-d',
      'Y/m/d': 'Y/m/d',
      'y/m/d': 'y/m/d',
      'j / F / Y': 'j / F / Y',
    },

    ordinalSuffixes: {
      '1': 'st',
      '2': 'nd',
      '3': 'rd',
      '4': 'th',
      '5': 'th',
      '6': 'th',
      '7': 'th',
      '8': 'th',
      '9': 'th',
      '10': 'th',
      '11': 'th',
      '12': 'th',
      '13': 'th',
      '14': 'th',
      '15': 'th',
      '16': 'th',
      '17': 'th',
      '18': 'th',
      '19': 'th',
      '20': 'th',
      '21': 'st',
      '22': 'nd',
      '23': 'rd',
      '24': 'th',
      '25': 'th',
      '26': 'th',
      '27': 'th',
      '28': 'th',
      '29': 'th',
      '30': 'th',
      '31': 'st',
    },
  }

  var DateFormatConfig = global.__abstract ?  __abstract({}, "(global._DateFormatConfig)") : global._DateFormatConfig;
  global.__makeSimple && __makeSimple(DateFormatConfig);

  var CLDRDateRenderingClientRollout = {
    formatDateClientLoggerSamplingRate: 0,
  }

  var MONTH_NAMES = void 0;

  var MONTH_NAMES_SHORT = void 0;
  var MONTH_NAMES_SHORT_UPPERCASE = void 0;
  var MONTH_NAMES_UPPERCASE = void 0;
  var ORDINAL_SUFFIXES = void 0;
  var WEEKDAY_NAMES = void 0;
  var WEEKDAY_NAMES_SHORT = void 0;
  var WEEKDAY_NAMES_UPPERCASE = void 0;
  var WEEKDAY_NAMES_SHORT_UPPERCASE = void 0;


  function padNumber(value, width) {
    var valueAsString = value.toString();
    if (valueAsString.length >= width) {
      return valueAsString;
    }
    return "0".repeat(width - valueAsString.length) + valueAsString;
  }

  var DateStrings = {
    getWeekdayName: function getWeekdayName(weekday) {
      if (!WEEKDAY_NAMES) {
        WEEKDAY_NAMES = [
          fbt._("Sunday", null, { hash_key: "3GbkKt" }),

          fbt._("Monday", null, { hash_key: "SiEnX" }),

          fbt._("Tuesday", null, { hash_key: "6DGCL" }),

          fbt._("Wednesday", null, { hash_key: "3uZoQP" }),

          fbt._("Thursday", null, { hash_key: "3F1Oo9" }),

          fbt._("Friday", null, { hash_key: "3LNd86" }),

          fbt._("Saturday", null, { hash_key: "2zPREc" })
        ];
      }

      return WEEKDAY_NAMES[weekday];
    },

    getUppercaseWeekdayName: function getUppercaseWeekdayName(weekday) {
      if (!WEEKDAY_NAMES_UPPERCASE) {
        WEEKDAY_NAMES_UPPERCASE = [
          fbt._("SUNDAY", null, { hash_key: "3muNda" }),

          fbt._("MONDAY", null, { hash_key: "3gC9R6" }),

          fbt._("TUESDAY", null, { hash_key: "3ZXNPo" }),

          fbt._("WEDNESDAY", null, { hash_key: "4nW3ic" }),

          fbt._("THURSDAY", null, { hash_key: "4xzeS8" }),

          fbt._("FRIDAY", null, { hash_key: "16QZCm" }),

          fbt._("SATURDAY", null, { hash_key: "12fhjD" })
        ];
      }

      return WEEKDAY_NAMES_UPPERCASE[weekday];
    },

    getWeekdayNameShort: function getWeekdayNameShort(weekday) {
      if (!WEEKDAY_NAMES_SHORT) {
        WEEKDAY_NAMES_SHORT = [
          fbt._("Sun", null, { hash_key: "1Y8oML" }),

          fbt._("Mon", null, { hash_key: "23q9QV" }),

          fbt._("Tue", null, { hash_key: "2vXYNg" }),

          fbt._("Wed", null, { hash_key: "3rFXYL" }),

          fbt._("Thu", null, { hash_key: "1GOFQy" }),

          fbt._("Fri", null, { hash_key: "AKx4x" }),

          fbt._("Sat", null, { hash_key: "36qDmV" })
        ];
      }

      return WEEKDAY_NAMES_SHORT[weekday];
    },

    getUppercaseWeekdayNameShort: function getUppercaseWeekdayNameShort(
      weekday
    ) {
      if (!WEEKDAY_NAMES_SHORT_UPPERCASE) {
        WEEKDAY_NAMES_SHORT_UPPERCASE = [
          fbt._("SUN", null, { hash_key: "3DfZRc" }),

          fbt._("MON", null, { hash_key: "rICsV" }),

          fbt._("TUE", null, { hash_key: "2dUV9K" }),

          fbt._("WED", null, { hash_key: "2rBBoY" }),

          fbt._("THU", null, { hash_key: "43K4sP" }),

          fbt._("FRI", null, { hash_key: "142PzH" }),

          fbt._("SAT", null, { hash_key: "pHYm1" })
        ];
      }

      return WEEKDAY_NAMES_SHORT_UPPERCASE[weekday];
    },

    _initializeMonthNames: function _initializeMonthNames() {
      MONTH_NAMES = [
        fbt._("January", null, { hash_key: "rJhdh" }),

        fbt._("February", null, { hash_key: "2XybFd" }),

        fbt._("March", null, { hash_key: "35Fbi" }),

        fbt._("April", null, { hash_key: "3T5b9S" }),

        fbt._("May", null, { hash_key: "40BSi8" }),

        fbt._("June", null, { hash_key: "3jjctP" }),

        fbt._("July", null, { hash_key: "3XzsaB" }),

        fbt._("August", null, { hash_key: "2vWhpK" }),

        fbt._("September", null, { hash_key: "4wJ3Jh" }),

        fbt._("October", null, { hash_key: "3VhmDl" }),

        fbt._("November", null, { hash_key: "ldHrf" }),

        fbt._("December", null, { hash_key: "2Zsda2" })
      ];
    },

    getMonthName: function getMonthName(month) {
      if (!MONTH_NAMES) {
        DateStrings._initializeMonthNames();
      }

      return MONTH_NAMES[month - 1];
    },

    getMonthNames: function getMonthNames() {
      if (!MONTH_NAMES) {
        DateStrings._initializeMonthNames();
      }

      return MONTH_NAMES.slice();
    },

    getUppercaseMonthName: function getUppercaseMonthName(month) {
      if (!MONTH_NAMES_UPPERCASE) {
        MONTH_NAMES_UPPERCASE = [
          fbt._("JANUARY", null, { hash_key: "1WA5Cn" }),

          fbt._("FEBRUARY", null, { hash_key: "2HT6Xq" }),

          fbt._("MARCH", null, { hash_key: "1WfNpT" }),

          fbt._("APRIL", null, { hash_key: "3ce2QE" }),

          fbt._("MAY", null, { hash_key: "1IK10h" }),

          fbt._("JUNE", null, { hash_key: "1YyXqF" }),

          fbt._("JULY", null, { hash_key: "2vBlD8" }),

          fbt._("AUGUST", null, { hash_key: "339Wje" }),

          fbt._("SEPTEMBER", null, { hash_key: "3sUHaI" }),

          fbt._("OCTOBER", null, { hash_key: "3HbBZF" }),

          fbt._("NOVEMBER", null, { hash_key: "2nHz6I" }),

          fbt._("DECEMBER", null, { hash_key: "3CD7nY" })
        ];
      }

      return MONTH_NAMES_UPPERCASE[month - 1];
    },

    getMonthNameShort: function getMonthNameShort(month) {
      if (!MONTH_NAMES_SHORT) {
        MONTH_NAMES_SHORT = [
          fbt._("Jan", null, { hash_key: "1Vgv9f" }),

          fbt._("Feb", null, { hash_key: "283xeM" }),

          fbt._("Mar", null, { hash_key: "Jf5aE" }),

          fbt._("Apr", null, { hash_key: "1AGV4s" }),

          fbt._("May", null, { hash_key: "2ZDkG3" }),

          fbt._("Jun", null, { hash_key: "2YzM3j" }),

          fbt._("Jul", null, { hash_key: "iz8QI" }),

          fbt._("Aug", null, { hash_key: "35VFIT" }),

          fbt._("Sep", null, { hash_key: "G0HkD" }),

          fbt._("Oct", null, { hash_key: "qytj8" }),

          fbt._("Nov", null, { hash_key: "22GxoD" }),

          fbt._("Dec", null, { hash_key: "2ZP3ZK" })
        ];
      }

      return MONTH_NAMES_SHORT[month - 1];
    },

    getUppercaseMonthNameShort: function getUppercaseMonthNameShort(
      month
    ) {
      if (!MONTH_NAMES_SHORT_UPPERCASE) {
        MONTH_NAMES_SHORT_UPPERCASE = [
          fbt._("JAN", null, { hash_key: "1PaQzr" }),

          fbt._("FEB", null, { hash_key: "24EfLh" }),

          fbt._("MAR", null, { hash_key: "246wVz" }),

          fbt._("APR", null, { hash_key: "3OvSos" }),

          fbt._("MAY", null, { hash_key: "UCOvh" }),

          fbt._("JUN", null, { hash_key: "4xuEdA" }),

          fbt._("JUL", null, { hash_key: "1yGl72" }),

          fbt._("AUG", null, { hash_key: "2r8rlG" }),

          fbt._("SEP", null, { hash_key: "2717pp" }),

          fbt._("OCT", null, { hash_key: "2UZpJB" }),

          fbt._("NOV", null, { hash_key: "1dsKlY" }),

          fbt._("DEC", null, { hash_key: "11QSNd" })
        ];
      }

      return MONTH_NAMES_SHORT_UPPERCASE[month - 1];
    },

    getOrdinalSuffix: function getOrdinalSuffix(day) {
      if (!ORDINAL_SUFFIXES) {
        ORDINAL_SUFFIXES = [
          "",
          fbt._("st", null, { hash_key: "4uwPgF" }),

          fbt._("nd", null, { hash_key: "4bMo81" }),

          fbt._("rd", null, { hash_key: "2X6K1n" }),

          fbt._("th", null, { hash_key: "1FRH7S" }),

          fbt._("th", null, { hash_key: "9rpNT" }),

          fbt._("th", null, { hash_key: "3eTLOm" }),

          fbt._("th", null, { hash_key: "3QBjiZ" }),

          fbt._("th", null, { hash_key: "2Qa2Dj" }),

          fbt._("th", null, { hash_key: "Hi79L" }),

          fbt._("th", null, { hash_key: "2OMxTp" }),

          fbt._("th", null, { hash_key: "1gIrii" }),

          fbt._("th", null, { hash_key: "M2fcr" }),

          fbt._("th", null, { hash_key: "4gmuXM" }),

          fbt._("th", null, { hash_key: "AwGmQ" }),

          fbt._("th", null, { hash_key: "flXcW" }),

          fbt._("th", null, { hash_key: "ALfFM" }),

          fbt._("th", null, { hash_key: "2Y9wGL" }),

          fbt._("th", null, { hash_key: "HBcN9" }),

          fbt._("th", null, { hash_key: "3VoHaJ" }),

          fbt._("th", null, { hash_key: "4ccy68" }),

          fbt._("st", null, { hash_key: "BvVG2" }),

          fbt._("nd", null, { hash_key: "1Jkx8h" }),

          fbt._("rd", null, { hash_key: "1OPwme" }),

          fbt._("th", null, { hash_key: "47sj3x" }),

          fbt._("th", null, { hash_key: "2IX7dL" }),

          fbt._("th", null, { hash_key: "3HPKIm" }),

          fbt._("th", null, { hash_key: "1cngQC" }),

          fbt._("th", null, { hash_key: "4h1xNr" }),

          fbt._("th", null, { hash_key: "4wOV9A" }),

          fbt._("th", null, { hash_key: "1WCdOS" }),

          fbt._("st", null, { hash_key: "4tbzNl" })
        ];
      }

      return ORDINAL_SUFFIXES[day];
    },

    getDayOfMonth: function getDayOfMonth(day) {
      switch (day) {
        case 1:
          return fbt._("1st", null, { hash_key: "1b2l0V" });

        case 2:
          return fbt._("2nd", null, { hash_key: "1CHf79" });

        case 3:
          return fbt._("3rd", null, { hash_key: "1NHQaq" });

        case 4:
          return fbt._("4th", null, { hash_key: "hEbYx" });

        case 5:
          return fbt._("5th", null, { hash_key: "xXmYe" });

        case 6:
          return fbt._("6th", null, { hash_key: "4vl7k5" });

        case 7:
          return fbt._("7th", null, { hash_key: "3Hqqo8" });

        case 8:
          return fbt._("8th", null, { hash_key: "1i6yWz" });

        case 9:
          return fbt._("9th", null, { hash_key: "PJEv9" });

        case 10:
          return fbt._("10th", null, { hash_key: "26wWxw" });

        case 11:
          return fbt._("11th", null, { hash_key: "p9vUL" });

        case 12:
          return fbt._("12th", null, { hash_key: "R8w0I" });

        case 13:
          return fbt._("13th", null, { hash_key: "Q45m8" });

        case 14:
          return fbt._("14th", null, { hash_key: "38CV0I" });

        case 15:
          return fbt._("15th", null, { hash_key: "38q5jr" });

        case 16:
          return fbt._("16th", null, { hash_key: "4oGKYb" });

        case 17:
          return fbt._("17th", null, { hash_key: "MeZin" });

        case 18:
          return fbt._("18th", null, { hash_key: "2ewzg4" });

        case 19:
          return fbt._("19th", null, { hash_key: "2jnQYm" });

        case 20:
          return fbt._("20th", null, { hash_key: "1QifRU" });

        case 21:
          return fbt._("21st", null, { hash_key: "3MjYe0" });

        case 22:
          return fbt._("22nd", null, { hash_key: "39hz3H" });

        case 23:
          return fbt._("23rd", null, { hash_key: "2h5AQL" });

        case 24:
          return fbt._("24th", null, { hash_key: "34dxRE" });

        case 25:
          return fbt._("25th", null, { hash_key: "4GwswU" });

        case 26:
          return fbt._("26th", null, { hash_key: "2H1YXj" });

        case 27:
          return fbt._("27th", null, { hash_key: "JxxwV" });

        case 28:
          return fbt._("28th", null, { hash_key: "4EfMG2" });

        case 29:
          return fbt._("29th", null, { hash_key: "3X2OP5" });

        case 30:
          return fbt._("30th", null, { hash_key: "NNtW4" });

        case 31:
          return fbt._("31st", null, { hash_key: "31xPtf" });

        default:
          /*throw*/ new Error("Invalid day of month.");
      }
    },

    getDayLabel: function getDayLabel() {
      return fbt._("Day:", null, { hash_key: "2dTq7H" });
    },

    getMonthLabel: function getMonthLabel() {
      return fbt._("Month:", null, { hash_key: "3weE2N" });
    },

    getYearLabel: function getYearLabel() {
      return fbt._("Year:", null, { hash_key: "4dBuCu" });
    },

    getHourLabel: function getHourLabel() {
      return fbt._("Hour:", null, { hash_key: "2cgoRP" });
    },

    getMinuteLabel: function getMinuteLabel() {
      return fbt._("Minute:", null, { hash_key: "1LFAt6" });
    },

    getDayPlaceholder: function getDayPlaceholder() {
      return fbt._("dd", null, { hash_key: "4orAR1" });
    },

    getMonthPlaceholder: function getMonthPlaceholder() {
      return fbt._("mm", null, { hash_key: "4pIVXF" });
    },

    getYearPlaceholder: function getYearPlaceholder() {
      return fbt._("yyyy", null, { hash_key: "yEGe7" });
    },

    getHourPlaceholder: function getHourPlaceholder() {
      return fbt._("h", null, { hash_key: "2Vllv8" });
    },

    getMinutePlaceholder: function getMinutePlaceholder() {
      return fbt._("m", null, { hash_key: "CeTJn" });
    },

    get12HourClockSuffix: function get12HourClockSuffix(dateHours) {
      if (dateHours < 12) {
        return fbt._("am", null, { hash_key: "3iDf2V" });
      }
      return fbt._("pm", null, { hash_key: "1zIzvw" });
    },

    getUppercase12HourClockSuffix: function getUppercase12HourClockSuffix(
      dateHours
    ) {
      if (dateHours < 12) {
        return fbt._("AM", null, { hash_key: "1Xr1io" });
      }
      return fbt._("PM", null, { hash_key: "xTri6" });
    }
  };

  function formatDate(date, format, options) {
    options = options || {};

    if (!format || (!date && date !== 0)) {
      return "";
    }

    if (typeof date === "string") {
      date = parseInt(date, 10);
    }
    if (typeof date === "number") {
      date = new Date(date * 1000);
    }
    if (typeof format !== "string") {
      var periods = getPeriods();
      for (var j in periods) {
        var period = periods[j];

        if (date.getTime() <= new Date(2018, 1, 1)) {
          if (period.start <= date.getTime() && format[period.name]) {
            format = format[period.name];
            break;
          }
        } else if (date.getTime() < period.end && format[period.name]) {
          format = format[period.name];
          break;
        }
      }
    }

    var localizedFormat;
    if (
      options.skipPatternLocalization ||
      (!options.formatInternal && isIntern())
    ) {
      localizedFormat = format;
    } else if (!DateFormatConfig.formats[format]) {
      if (format.length !== 1) {
        var errorMessage =
          "error happened for date " +
          date.getTime() +
          " with\n        format " +
          format +
          " when time is " +
          new Date(2018, 1, 1) +
          " during localization";
      
        localizedFormat = format;
      }
    } else {
      localizedFormat = DateFormatConfig.formats[format];
    }

    var prefix = /*options.utc*/ true ? "getUTC" : "get";
    var dateDay = date[prefix + "Date"]();
    var dateDayOfWeek = date[prefix + "Day"]();
    var dateMonth = date[prefix + "Month"]();
    var dateYear = date[prefix + "FullYear"]();
    var dateHours = date[prefix + "Hours"]();
    var dateMinutes = date[prefix + "Minutes"]();
    var dateSeconds = date[prefix + "Seconds"]();
    var dateMilliseconds = date[prefix + "Milliseconds"]();

    var output = "";
    for (var i = 0; i < localizedFormat.length; i++) {
      var character = localizedFormat.charAt(i);

      switch (character) {
        case "\\":
          i++;
          output += localizedFormat.charAt(i);
          break;

        case "d":
          output += padNumber(dateDay, 2);
          break;
        case "j":
          output += dateDay;
          break;
        case "S":
          output += DateStrings.getOrdinalSuffix(dateDay);
          break;

        case "D":
          output += DateStrings.getWeekdayNameShort(dateDayOfWeek);
          break;
        case "l":
          output += DateStrings.getWeekdayName(dateDayOfWeek);
          break;

        case "F":
        case "f":
          output += DateStrings.getMonthName(dateMonth + 1);
          break;
        case "M":
          output += DateStrings.getMonthNameShort(dateMonth + 1);
          break;
        case "m":
          output += padNumber(dateMonth + 1, 2);
          break;
        case "n":
          output += dateMonth + 1;
          break;

        case "Y":
          output += dateYear;
          break;
        case "y":
          output += ("" + dateYear).slice(2);
          break;

        case "a":
          if (options.skipSuffixLocalization) {
            output += dateHours < 12 ? "am" : "pm";
          } else {
            output += DateStrings.get12HourClockSuffix(dateHours);
          }
          break;
        case "A":
          if (options.skipSuffixLocalization) {
            output += dateHours < 12 ? "AM" : "PM";
          } else {
            output += DateStrings.getUppercase12HourClockSuffix(
              dateHours
            );
          }
          break;
        case "g":
          output +=
            dateHours === 0 || dateHours === 12 ? 12 : dateHours % 12;
          break;
        case "G":
          output += dateHours;
          break;
        case "h":
          if (dateHours === 0 || dateHours === 12) {
            output += 12;
          } else {
            output += padNumber(dateHours % 12, 2);
          }
          break;
        case "H":
          output += padNumber(dateHours, 2);
          break;
        case "i":
          output += padNumber(dateMinutes, 2);
          break;
        case "s":
          output += padNumber(dateSeconds, 2);
          break;
        case "X":
          output += padNumber(dateMilliseconds, 3);
          break;

        default:
          output += character;
      }
    }

    return output;
  }

  function getPeriods() {
    var now = new Date(2018, 1, 1);
    var nowMilliseconds = now.getTime();
    var nowYear = now.getFullYear();
    var nowMonth = now.getMonth();
    var monthDays = new Date(nowYear, now.getMonth() + 1, 0).getDate();
    var yearDays = new Date(nowYear, 1, 29).getMonth() === 1 ? 366 : 365;
    var dayMilliseconds = 1000 * 60 * 60 * 24;

    var dayStartDate = new Date(now.setHours(0, 0, 0, 0));
    var dayEndDate = new Date(
      nowYear,
      nowMonth,
      dayStartDate.getDate() + 1
    );

    var weekStartDate =
      now.getDate() - (now.getDay() - DateFormatConfig.weekStart + 6) % 7;
    var weekStartMilliseconds = new Date(now.getTime()).setDate(
      weekStartDate
    );

    var weekEndMilliseconds = new Date(now.getTime()).setDate(
      weekStartDate + 7
    );

    var monthStartDate = new Date(nowYear, nowMonth, 1);
    var monthEndDate = new Date(nowYear, nowMonth, monthDays + 1);
    var yearStartDate = new Date(nowYear, 0, 1);
    var yearEndDate = new Date(nowYear + 1, 0, 1);

    return [
      {
        name: "today",
        start: dayStartDate.getTime(),
        end: dayEndDate.getTime()
      },

      {
        name: "withinDay",
        start: nowMilliseconds - dayMilliseconds,
        end: nowMilliseconds + dayMilliseconds
      },

      {
        name: "thisWeek",
        start: weekStartMilliseconds,
        end: weekEndMilliseconds
      },

      {
        name: "withinWeek",
        start: nowMilliseconds - dayMilliseconds * 7,
        end: nowMilliseconds + dayMilliseconds * 7
      },

      {
        name: "thisMonth",
        start: monthStartDate.getTime(),
        end: monthEndDate.getTime()
      },

      {
        name: "withinMonth",
        start: nowMilliseconds - dayMilliseconds * monthDays,
        end: nowMilliseconds + dayMilliseconds * monthDays
      },

      {
        name: "thisYear",
        start: yearStartDate.getTime(),
        end: yearEndDate.getTime()
      },

      {
        name: "withinYear",
        start: nowMilliseconds - dayMilliseconds * yearDays,
        end: nowMilliseconds + dayMilliseconds * yearDays
      },

      {
        name: "older",
        start: -Infinity
      },

      {
        name: "future",
        end: +Infinity
      }
    ];
  }

  formatDate.periodNames = [
    "today",
    "thisWeek",
    "thisMonth",
    "thisYear",
    "withinDay",
    "withinWeek",
    "withinMonth",
    "withinYear",
    "older",
    "future"
  ];

  function isIntern() {
    if (
      typeof window === "undefined" ||
      !window ||
      !window.location ||
      !window.location.pathname
    ) {
      return false;
    }

    var path = window.location.pathname;
    var internPath = "/intern";

    return path.substr(0, internPath.length) === internPath;
  }

  function fn(a, b) {
    return {
      foo: formatDate(a, "l, F j, Y"),
      bar: formatDate(b, "g:i A"),
    };
  }

  global.fn = fn;

  global.__optimize && __optimize(fn);

  global.inspect = function() {
    return JSON.stringify(global.fn("1529579851072", "1529579851072"));
  }

})();