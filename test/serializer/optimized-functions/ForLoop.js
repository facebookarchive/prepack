// throws introspection error
var x = global.__abstract ? (x = __abstract("number", "(2)")) : 2;

function func1() {
  for (let i = 0; i < 3; i++) {
    if (i === x) {
      break;
    }
    if (i === 2) {
      throw new Error("X is 2");
    }
  }
}

if (global.__optimize) __optimize(func1);

inspect = function() {
  return func1();
};
