// expected Warning: PP1007
// does not contain:x = 5;
// does not contain:y = 10;
// add at runtime: global.a = {}; global.b = {};
if (global.__abstract) {
  global.a = __abstract({}, "global.a");
  global.b = __abstract({}, "global.b");
}
if (global.__makeSimple) {
  __makeSimple(global.a);
  __makeSimple(global.b);
}
var z = 42;

function additional1() {
  global.a.foo = z + "foo";
  var x = 5;
}

function additional2() {
  global.b.bar = z + "bar";
  var y = 10;
}

if (global.__optimize) {
  global.__optimize(additional1);
  global.__optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return JSON.stringify(global.a) + JSON.stringify(global.b);
};
