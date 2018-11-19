if (!global.__evaluatePureFunction) {
  global.__evaluatePureFunction = f => f();
}

inspect = __evaluatePureFunction(() => {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  let objAsKey = {
    y: 1,
    get toString() {
      this.y = 2;
      return function() {
        return "x";
      };
    },
  };
  let abstractKey = c ? objAsKey : "y";
  let obj = { x: 3 };
  obj[abstractKey] = 5;
  let y = objAsKey.y;
  return function() {
    return JSON.stringify({ obj, y });
  };
});
