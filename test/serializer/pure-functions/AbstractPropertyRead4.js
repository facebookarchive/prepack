// does contain: "barone"
// does not contain: "23"

var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
let absFunc = global.__abstract ? __abstract("function", "(x => x)") : x => x;

let x, y;
__evaluatePureFunction(() => {
  let obj1 = { foo: "bar" };
  Object.freeze(obj1);
  let obj2 = { one: obj1, two: 2 };
  absFunc(obj2);
  x = obj1.foo + "one";
  y = obj2.two + "3";
});

inspect = function() {
  return x + " " + y;
};
