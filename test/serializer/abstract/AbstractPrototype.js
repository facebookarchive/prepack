let obj = global.__abstract ? __abstract("object", "({})") : {};

function Constructor() {}
Constructor.prototype = obj;

let obj2 = new Constructor();

inspect = function() {
  return Object.getPrototypeOf(obj2) === obj;
};
