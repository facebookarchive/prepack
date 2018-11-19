(function() {
  let a = global.__abstract ? __abstract("boolean", "(true)") : true;
  let b = global.__abstract ? __abstract("boolean", "(true )") : true;
  let x;
  if (a) {
    if (b) {
      x = Date.now(); // definition
    }
    var xx = x; // use of `x`
  }
  xxx = x; // use of `x`
  inspect = function() {
    return xx >= 0;
  };
})();
