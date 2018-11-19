// es6
let a = { a: 1 };
let b = { b: 3 };
let c = { c: 5 };
var m = new WeakMap([[a, 2], [b, 4]]);
m.foo = 123;
m.set(c, m);
m.set(m, 6);

z = m;

inspect = function() {
  return (
    m.size === 4 &&
    m instanceof WeakMap &&
    m.foo === 123 &&
    m.get(a) === 2 &&
    m.get(b) === 4 &&
    m.get(m) === 6 &&
    m.get(c) === m
  );
};
