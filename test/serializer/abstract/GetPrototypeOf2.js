let o = global.__abstract ? __abstract({}, "{}") : {};

p = Object.getPrototypeOf(o);

inspect = function() { return p === Object.prototype; }
