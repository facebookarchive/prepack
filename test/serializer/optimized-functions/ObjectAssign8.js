// Copies of return 1;:1
// We essentially expect "fn" to optimize to "function () { return 1; }"

function fn() {
  var a = {};
  var b = {
    prop1: 1,
    prop2: 2,
  };
  global.__makePartial && __makePartial(b);
  global.__makeSimple && __makeSimple(b);
  var c = {
    prop3: 3,
    prop4: 4,
  };
  Object.assign(a, b, c);
  return a.prop1;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn();
};
