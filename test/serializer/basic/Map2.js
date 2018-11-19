var m = new Map([["a", 1], ["b", 2]]);
m.foo = 123;

var z = m;

inspect = function() {
  return m.size === 2 && m instanceof Map && m.foo === 123 && m.get("a") === 1 && m.get("b") === 2;
};
