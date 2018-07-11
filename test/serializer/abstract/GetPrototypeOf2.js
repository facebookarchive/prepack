let o = global.__abstract ? __abstract({}, "{}") : {};

var p = Object.getPrototypeOf(o);

inspect = function() {
  return p === Object.prototype;
};
