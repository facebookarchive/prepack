// does not contain:z = 5;
// does contain:16:11
// Copies of x = 25: 1
// add at runtime: global.x = 3;
var x;
if (global.__abstract) x = __abstract("number", "(3)");
else x = 3;

function func1() {
  let z = 5;
  if (x > 10) {
    x = 15;
    throw new Error("X greater than 10 " + x);
  } else if (x > 20) {
    x = 25;
    throw new Error("X greater than 20 " + x);
  }
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
  return "err: " + error + " ret " + ret;
};
