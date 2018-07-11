function fn(arg) {
  if (!arg.condition) {
    return null;
  }

  var fooArr = Array.from(arg.foo);
  return arg.calculate(function() {
    var x = fooArr;

    return function() {
      return x;
    };
  });
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  var x = fn({ condition: false });
  var y = fn({
    condition: true,
    foo: 10,
    calculate(f) {
      return f;
    },
  });
  var z = y();
  var y2 = fn({
    condition: true,
    foo: [1, 2, 3],
    calculate(f) {
      return f;
    },
  });
  var z2 = y();
  return JSON.stringify(z, z2);
};
