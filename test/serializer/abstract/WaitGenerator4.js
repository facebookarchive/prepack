(function() {
  let x = global.__abstract ? __abstract("boolean", "(true)") : true;
  // Create second abstract value with a different name so that !x.equals(y).
  let y = global.__abstract ? __abstract("boolean", "((true))") : true;
  let obj = { time: 99 };
  var f;
  if (x) {
    if (y) {
      // Wait for abstract value in sub-generator more than one depth.
      obj.time = Date.now();
    } else {
      delete obj.time;
    }
    f = function() {
      return obj;
    };
  } else {
    f = function() {
      return obj;
    };
  }
  inspect = function() {
    return f().time > 0;
  };
})();
