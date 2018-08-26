function foo(havoc, condition) {
  let obj = { x: 1, y: 2 };
  let havocedObj = { x: 3, y: 4 };
  let conditionalObj = condition ? havocedObj : obj;
  havoc(havocedObj);
  return conditionalObj.x;
}

if (global.__optimize) __optimize(foo);

inspect = function() {
  let calls1 = 0;
  let returnValue1 = foo(obj => {
    Object.defineProperty(obj, "x", {
      get() {
        // Should not be called.
        calls1++;
        return 5;
      },
    });
  }, false);
  let calls2 = 0;
  let returnValue2 = foo(obj => {
    Object.defineProperty(obj, "x", {
      get() {
        // Should be called.
        calls2++;
        return 6;
      },
    });
  }, true);
  return JSON.stringify({ calls1, returnValue1, calls2, returnValue2 });
};
