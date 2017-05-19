foo = {x: 42};
let obj = global.__abstract ? __abstract({x: __abstract('number', 'foo.x')}, "foo") : foo;
let y = obj.x++;
inspect = function() { return '' + obj.x + y; }
