let c = global.__abstract ? __abstract("boolean", "(false)") : false;

function foo(havoc, key) {
  let obj = { x: 1, y: 2 };
  let havocedObj = { x: 3, y: 4 };
  let conditionalObj = c ? havocedObj : obj;
  havoc(havocedObj);
  conditionalObj[key] = 5;
  return obj.x;
}

if (global.__optimize) __optimize(foo);

inspect = function() {
  let called = false;
  let returnValue = foo(obj => {
    Object.defineProperty(obj, "x", {
      set(value) {
        // Should not be called.
        called = true;
      },
    });
  }, "x");
  return JSON.stringify({ called, returnValue });
};
