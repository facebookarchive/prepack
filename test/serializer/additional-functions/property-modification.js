// does not contain:x = 5;
// does not contain:y = 10;

global.a = {};
global.b = {};
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
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return JSON.stringify(global.a) + JSON.stringify(global.b);
};
