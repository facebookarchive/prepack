// The conditional abstract value "obj.time" is referenced both from residual function and global scope.
(function() {
  let x = global.__abstract ? __abstract("boolean", "(true)") : true;
  // Reference "obj.time" before its dependency abstract value "scope" to trigger wait generator body ordering.
  residual = function() {
    return obj.time > 0;
  };
  var obj = {};
  if (x) {
    var scope = Date.now();
    obj.time = scope;
  } else {
    obj.time = -33;
  }
  global.obj = obj.time;
  inspect = function() {
    return global.obj.time > 0;
  };
})();
