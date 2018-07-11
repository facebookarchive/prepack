// does not contain:z = 5;
// add at runtime: global.x = 3;
var x;
if (global.__abstract) x = __abstract("number", "(11)");
else x = 11;
var obj = { foo: null };

function func1() {
  let z = 5;
  obj.foo = 10;
  if (x > 10) {
    obj.foo = 15;
    throw new Error("X greater than 10 " + x);
  }
  obj.foo = 20;
  return x;
}

if (global.__optimize) __optimize(func1);

inspect = function() {
  let error;
  let ret;
  try {
    ret = func1();
  } catch (e) {
    error = e.message;
  }
  return "err: " + error + " ret " + ret + " foo " + global.foo;
};
