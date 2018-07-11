var x = global.__abstract ? (x = __abstract(undefined, "({ check: false })")) : { check: false };

function func1() {
  if (x.check) {
    throw new Error("This should never happen");
  }
  return 1;
}

if (global.__optimize) __optimize(func1);

inspect = function() {
  return func1();
};
