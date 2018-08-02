(function() {
  let x = global.__abstract ? __abstract("boolean", "(true)") : true;
  global.obj = {};
  if (x) {
    var scope = Date.now();
    global.obj.time = scope;
  } else {
    global.obj.time = 33;
  }
  inspect = function() {
    return global.obj.time > 0;
  };
})();
