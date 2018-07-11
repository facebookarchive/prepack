var m = new Set(["a", "b"]);
m.foo = 123;
m.add(m);

z = m;

inspect = function() {
  return m instanceof Set && m.foo === 123 && m.has("a") && m.has("b") && m.has(m) && m.size === 3;
};
