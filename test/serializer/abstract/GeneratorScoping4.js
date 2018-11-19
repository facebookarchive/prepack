(function() {
  let x = global.__abstract ? __abstract("boolean", "/* x = */(true)") : true;
  let y = global.__abstract ? __abstract("boolean", "/* y = */(true)") : true;
  let obj = { p: 42 };
  var f;
  var g;
  if (y) {
    if (x) {
      f = function() {
        return obj;
      };
    } else {
      g = function() {
        return obj;
      };
    }
  }
  inspect = function() {
    return (f || g)().p;
  };
})();
