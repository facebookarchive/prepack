// add at runtime:var foo = {};
// Copies of .bar:2
// omit invariants
var ob = global.__makeSimple ? __makeSimple(__abstract({}, "foo")) : {};
ob.bar = { a: 1 };

inspect = function() {
  return JSON.stringify(ob.bar);
};
