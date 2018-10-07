(function() {
  let b = global.__abstract ? __abstract("boolean", "(true)") : true;
  let obj = {};
  if (b) {
    global.obj = obj;
  } else {
    obj.x = 42;
  }
})();
