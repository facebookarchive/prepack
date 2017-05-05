let obj = global.__abstract ? __abstract({}, "({'5': 6})") : {'5':6};
if (global.__makeSimple) __makeSimple(obj);
x = obj[5];

inspect = function() { return x === 6; }
