// does not contain:x = 5;
// does not contain:y = 10;

global.c = {};

function additional1() {
  global.c.foo = 5;
  var x = 5;
}

function additional2() {
  global.c.bar = 2;
  var y = 10;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.b + global.c.foo + global.c.bar;
};
