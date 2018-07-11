var x = global.__abstract ? (x = __abstract(undefined, "({ check: true })")) : { check: true };

function nullthrows(x) {
  var message = arguments.length <= 1 || arguments[1] === undefined ? "Got unexpected null or undefined" : arguments[1];
  if (x != null) {
    return x;
  }
  var error = new Error(message);

  error.framesToPop = 1;
  throw error;
}

function func1() {
  nullthrows(x.check);
  return {
    check: x.check,
  };
}

if (global.__optimize) __optimize(func1);

inspect = function() {
  return func1();
};
