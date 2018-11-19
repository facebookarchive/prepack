// does not contain:z = 5;
// add at runtime: global.x = 3;

var x;
if (global.__abstract) x = __abstract("number", "(4)");
else x = 4;
var obj = { foo: null };

function func1(doNotThrow) {
  let z = 5;
  obj.foo = 10;
  if (x > 10) {
    obj.foo = 15;
    if (doNotThrow) {
      obj.foo = 18;
      return 15;
    } else {
      throw new Error("X greater than 10 " + x);
    }
  } else if (x > 5) {
    if (doNotThrow) {
      return 100;
    } else {
      obj.foo = 17;
      throw new Error("X greater than 5 " + x);
    }
  }
  obj.foo = 20;
  throw new Error("Returning " + x);
  //return x;
}

if (global.__optimize) __optimize(func1);

inspect = function() {
  let error;
  let normalRet;
  let ret;
  try {
    normalRet = func1(true);
    ret = func1(false);
  } catch (e) {
    error = e.message;
  }
  return "err: " + error + " ret " + ret + " normal ret " + normalRet + " foo " + obj.foo;
};
