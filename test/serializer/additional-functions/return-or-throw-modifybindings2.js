// does not contain:z = 5;
// add at runtime: global.x = 3;
var x;
if (global.__abstract) x = __abstract("number", "(11)");
else x = 11;

(function() {
  var foo;

  function func1() {
    let z = 5;
    foo = 10;
    if (x > 10) {
      foo = 15;
      throw new Error("X greater than 10 " + x);
    }
    foo = 20;
    return x;
  }
  global.func1 = func1;

  if (global.__optimize) __optimize(func1);

  global.inspect = function() {
    let prevfoo = foo;
    let error;
    let ret;
    try {
      ret = func1();
    } catch (e) {
      error = e.message;
    }
    return "prevfoo: " + prevfoo + " err: " + error + " ret " + ret + " foo " + foo;
  };
})();
