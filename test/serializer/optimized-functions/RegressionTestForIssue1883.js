(function() {
  function save(obj, x) {
    if (!obj[x]) {
      obj[x] = x;
    }
  }

  function fn(arg) {
    var obj = {};
    if (arg != null) {
      save(obj);
    } else {
      save(obj, arg === 1 ? "a" : "b");
      save(obj);
    }
    return obj;
  }

  if (global.__optimize) __optimize(fn);

  global.inspect = function() {
    return JSON.stringify([fn(null), fn(undefined), fn(1), fn({})]);
  };
})();
