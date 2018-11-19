var x = global.__abstract ? (x = __abstract("number", "(23)")) : 23;

function func1() {
  let z = 5;
  if (x > 20) {
    x = 15;
    throw new Error("X greater than 10 " + x);
  } else if (x > 10) {
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
