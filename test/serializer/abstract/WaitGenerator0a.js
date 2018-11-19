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
      var xx = x; // use of `x`
    } else {
      xx = x; // use of `x`
    }
  }
  var xxx = x; // use of `x`
  inspect = function() {
    return Object.is(xx, xxx) && xx >= 0;
  };
})();
