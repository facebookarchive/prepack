if (!this.__evaluatePureFunction) {
  this.__evaluatePureFunction = function(f) {
    return f();
  };
}

var symbol = Symbol();

var result = __evaluatePureFunction(() => {
  var somethingUnknown = global.__abstract ? __abstract(undefined, "({})") : {};
  somethingUnknown.foo = 123;
  somethingUnknown["0"] = "bar";
  somethingUnknown[symbol] = 5;
  return somethingUnknown;
});

inspect = function() {
  return JSON.stringify([result.foo, result[0], result[symbol]]);
};
