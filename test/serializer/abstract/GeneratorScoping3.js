(function() {
  let a = global.__abstract ? __abstract("boolean", "(false)") : false;
  let x = global.__abstract ? __abstract("number", "(42)") : 42;
  let y = x * 2;
  var z;
  if (a) {
    z = y;
  } else {
    z = function() {
      return y;
    };
  }
  inspect = function() {
    return (z instanceof Function ? z() : z).toString();
  };
})();
