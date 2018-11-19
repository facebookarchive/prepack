(function() {
  let a = global.__abstract ? __abstract("boolean", "(true)") : true;
  let b = global.__abstract ? __abstract("boolean", "(true )") : true;
  let c = global.__abstract ? __abstract("boolean", "(true  )") : true;
  let x;
  if (a) {
    if (b) {
      x = Date.now(); // definition
    }
    if (c) {
      var xx = x + 1; // use of `x`
    } else {
      xx = x + 2; // use of `x`
    }
  }
  xxx = x + 3; // use of `x`
  inspect = function() {
    return xx >= 0;
  };
})();
