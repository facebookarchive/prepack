(function() {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  var a = { enumerableProp: 1 };
  var b = { enumerableProp: 2 };
  var obj = c ? a : b;
  Object.defineProperty(obj, "enumerableProp", {
    value: 3,
  });
  global.result = Object.getOwnPropertyDescriptor(a, "enumerableProp");
  inspect = function() {
    return global.result;
  };
})();
