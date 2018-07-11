(function() {
  let a = global.__abstract ? __abstract("boolean", "(false)") : false;
  let obj = {};
  if (a) {
    obj.notAnObject = Date.now();
  }
  inspect = function() {
    return obj.notAnObject instanceof Object;
  };
})();
