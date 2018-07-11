(function() {
  global._DateFormatConfig = {
    formats: {
      "l, F j, Y": "l, F j, Y",
    },
  };

  var DateFormatConfig = global.__abstract ? __abstract({}, "(global._DateFormatConfig)") : global._DateFormatConfig;
  global.__makeSimple && __makeSimple(DateFormatConfig);

  var MONTH_NAMES = void 0;
  var WEEKDAY_NAMES = void 0;

  var DateStrings = {
    getWeekdayName: function getWeekdayName(weekday) {
      if (!WEEKDAY_NAMES) {
        WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      }

      return WEEKDAY_NAMES[weekday];
    },
    _initializeMonthNames: function _initializeMonthNames() {
      MONTH_NAMES = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
    },

    getMonthName: function getMonthName(month) {
      if (!MONTH_NAMES) {
        DateStrings._initializeMonthNames();
      }

      return MONTH_NAMES[month - 1];
    },
  };

  function formatDate(date, format, options) {
    options = options || {};

    if (typeof date === "string") {
      date = parseInt(date, 10);
    }
    if (typeof date === "number") {
      date = new Date(date * 1000);
    }
    var localizedFormat = DateFormatConfig.formats[format];
    var prefix = "getUTC";
    var dateDay = date[prefix + "Date"]();
    var dateDayOfWeek = date[prefix + "Day"]();
    var dateMonth = date[prefix + "Month"]();
    var dateYear = date[prefix + "FullYear"]();

    var output = "";
    for (var i = 0; i < localizedFormat.length; i++) {
      var character = localizedFormat.charAt(i);

      switch (character) {
        case "j":
          output += dateDay;
          break;
        case "l":
          output += DateStrings.getWeekdayName(dateDayOfWeek);
          break;
        case "F":
        case "f":
          output += DateStrings.getMonthName(dateMonth + 1);
          break;
        case "Y":
          output += dateYear;
          break;
        default:
          output += character;
      }
    }

    return output;
  }

  function fn(a, b) {
    return formatDate(a, "l, F j, Y");
  }

  global.fn = fn;

  global.__optimize && __optimize(fn);

  global.inspect = function() {
    return JSON.stringify(global.fn("1529579851072"));
  };
})();
