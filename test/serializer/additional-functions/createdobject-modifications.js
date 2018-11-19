// does not contain:x = 5;
// does not contain:y = 10;

global.foo = { x: 100, y: 200 };
var z = 42;

function additional1() {
  let local = {};
  local.x = global.foo.x;
  local.foo = z + local.x;
  delete local.x;
  var x = 5;
  global.foo.x = local;
}

function additional2() {
  let local = {};
  local.y = global.foo.y;
  local.bar = z + local.y;
  delete local.y;
  var y = 10;
  global.foo.y = local;
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  let foo = global.foo;
  return "" + JSON.stringify(foo.x) + JSON.stringify(foo.y);
};
