// does not contain: bar
let a = global.__abstractOrNull ? __abstractOrNull("object", "({ foo: 0 })") : {};
let b = a == null;
let c = !b;
let ob = b ? null : { bar: 1 };
let obstr = c ? "str" : ob;

inspect = function() {
  return obstr;
};
