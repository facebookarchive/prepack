// does not contain:assign
(function() {
  function fn(arg) {
    let a = {x: Object.keys(arg) };
    let b = Object.prototype.hasOwnProperty.call(arg, 'foo');
    let c = arg.foo;
    return {a, b, c};
  }

  if (global.__optimize) global.__optimize(fn);

  global.inspect = function() {
    let err;
    try {
      fn(null);
    } catch (e) {
      err = e;
    }
    return JSON.stringify([
      fn(2),
      fn({}),
      fn({foo: 'bar'}),
      err.message
    ]);
  };
})();