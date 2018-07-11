(function() {
  let c = global.__abstract ? __abstract("boolean", "(true)") : true;
  var a = { x: 1 };
  var b = {};
  var obj = c ? a : b;
  obj.x = 2;
  global.result = a.x;
  global.residualObject = b;
  inspect = function() {
    return global.result + " " + global.residualObject.x + " " + global.residualObject.hasOwnProperty("x");
  };
})();
