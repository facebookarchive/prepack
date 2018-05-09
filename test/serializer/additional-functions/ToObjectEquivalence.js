(function() {
  function fn(arg) {
    var a = arg ? arg.a : null;
    var b = arg ? arg.b : null;
    return { a, b };
  }

  if (global.__optimize) global.__optimize(fn);

  global.inspect = function() {
    return JSON.stringify([fn(null), fn({ a: 1, b: 1 })]);
  };
})();