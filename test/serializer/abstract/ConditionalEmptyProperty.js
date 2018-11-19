(function() {
  function fn(arg) {
    var obj1 = {};
    var obj2 = {};
    if (arg) {
      obj2.bar = true;
    } else {
      obj1.foo = true;
    }
    return { obj1, obj2 };
  }

  if (global.__optimize) __optimize(fn);

  global.inspect = function() {
    return JSON.stringify([fn(null), fn(undefined), fn(10)]);
  };
})();
