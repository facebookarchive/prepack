(function() {
  let x = global.__abstract ? __abstract("boolean", "(true)") : true;
  let obj = { time: 99 };
  var f;
  if (x) {
    obj.time = Date.now();
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
