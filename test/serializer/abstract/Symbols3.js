// es6
(function() {
  let x = global.__abstract ? __abstract("boolean", "(true)") : true;
  let obj = {};
  let symbol = Symbol();
  if (x) {
    obj[symbol] = 42;
  }
  inspect = function() {
    return obj[symbol];
  };
})();
