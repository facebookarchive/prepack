(function() {
  var x = global.__abstract ? __abstract("boolean", "(true)") : true;
  if (x) {
    var obj = {};
    global.obj = obj;
    obj.time = Date.now();
  }
  inspect = function() {
    return global.obj.time > 0;
  };
})();
