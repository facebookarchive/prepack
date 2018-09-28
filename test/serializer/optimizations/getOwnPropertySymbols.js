function objectSpread(target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i] != null ? arguments[i] : {};
    var ownKeys = Object.keys(source);

    if (typeof Object.getOwnPropertySymbols === "function") {
      ownKeys = ownKeys.concat(
        Object.getOwnPropertySymbols(source).filter(function(sym) {
          return Object.getOwnPropertyDescriptor(source, sym).enumerable;
        })
      );
    }

    ownKeys.forEach(function(key) {
      babelHelpers.defineProperty(target, key, source[key]);
    });
  }

  return target;
}

function fn(baseHeaders, contentEncoding, userAgent) {
  var headers = objectSpread({}, baseHeaders);

  if (contentEncoding) {
    headers["Content-Encoding"] = contentEncoding;
  }

  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }

  return headers;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify(fn({ a: 1, b: 2 }, "123", "456"));
};
