// es6
(function() {
  //let x = global.__abstract ? __abstract("boolean", "(true)") : true;
  let obj = {};
  let symbol = Symbol();
  obj[symbol] = 42;
  delete obj[symbol];
  inspect = function() {
    return symbol in obj;
  };
})();
