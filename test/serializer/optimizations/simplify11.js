(function() {
  function fn(arg) {
    return arg == null ? "a" : arg && "b";
  }

  if (global.__optimize) __optimize(fn);

  global.inspect = function() {
    return JSON.stringify([fn(null), fn(undefined), fn({})]);
  };
})();
