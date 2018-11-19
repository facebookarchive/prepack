// es6
let nondet = global.__abstract ? __abstract("boolean", "true") : true;
global.a = undefined;
let descriptor;
if (nondet) {
  descriptor = Object.getOwnPropertyDescriptor(global, "a");
  if ("get" in descriptor) global.b = "impossible 1";
  Object.defineProperty(global, "a", {
    get: function() {
      return 123;
    },
  });
} else {
  descriptor = Object.getOwnPropertyDescriptor(global, "a");
  if ("get" in descriptor) global.b = "impossible 2";
  Object.defineProperty(global, "a", {
    get: function() {
      return 456;
    },
  });
}

inspect = function() {
  return global.b === undefined && global.a === 123;
};
