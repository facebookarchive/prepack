// es6
let a = { a: 1 };
let b = { b: 2 };
var m = new WeakSet([a, b]);
m.foo = 123;

var z = m;

inspect = function() {
  return m instanceof WeakSet && m.foo === 123 && m.has(a) === 1 && m.has(b) === 2 && m.size === 2;
};
