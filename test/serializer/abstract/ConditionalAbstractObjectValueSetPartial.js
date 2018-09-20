// does not contain:unnecessaryIndirection:
(function() {
  let c1 = global.__abstract ? __abstract("boolean", "(true)") : true;
  let c2 = global.__abstract ? __abstract("boolean", "(!false)") : true;
  let key = global.__abstract ? __abstract("string", "('unnecessaryIndirection')") : "unnecessaryIndirection";
  var a = { unnecessaryIndirection: 1 };
  var b = { unnecessaryIndirection: 2 };
  var c = { unnecessaryIndirection: 3 };
  var obj1 = c1 ? a : b;
  var obj2 = c2 ? obj1 : c;
  obj2[key] = 5;
  global.result = a.unnecessaryIndirection;
  inspect = function() {
    return global.result;
  };
})();
