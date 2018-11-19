// expected Warning: PP1007
(function() {
  var cache = {};
  function fn(args) {
    var maybeTrue = args.unknown === 42;
    var maybeNull = maybeTrue ? {} : null;

    var cacheKey = maybeNull.foo;
    var cachedValue = cache[cacheKey];
    if (cachedValue) {
      return cachedValue;
    }

    var result;
    cache[cacheKey] = result;
    return result;
  }
  if (global.__optimize) __optimize(fn);
  global.fn = fn;
  inspect = function() {
    try {
      fn(23);
      return "impossible";
    } catch (e) {
      return e instanceof TypeError;
    }
  };
})();
