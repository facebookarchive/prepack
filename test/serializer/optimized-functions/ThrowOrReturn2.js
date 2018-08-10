function foo(cond) {
  var d = {};

  if (cond) {
    throw "I am an error!";
  }

  return d;
}

function fn(cond, cond2) {
  var a = {};
  var b = {
    prop1: 1,
  };
  if (global.__makeSimple) {
    global.__makePartial(b);
    global.__makeSimple(b);
  }
  Object.assign(a, b);

  if (cond2) {
    var res = Object.assign(foo(cond), b);
    return res.prop1;
  }

  return a.prop1;
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return fn(true, false);
};
