// does contain: "barone"

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
let absFunc = global.__abstract ? __abstract("function", "(x => x)") : x => x;

let x, y;
__evaluatePureFunction(() => {
  let obj1 = { foo: "bar" };
  Object.freeze(obj1);
  absFunc(obj1);
  x = obj1.foo + "one";
});

inspect = function() {
  return x;
};
