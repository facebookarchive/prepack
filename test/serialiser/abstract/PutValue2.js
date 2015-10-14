var obj = global.__abstract ? __abstract({ someProperty: 41 }, "({ someProperty: 41} )") : {};
obj.someProperty = 42;
z = obj.someProperty;

inspect = function() { return "" + z; }
