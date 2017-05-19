let x = global.__abstract ? __abstract("number", "42") : 42;
let y = x++;
++x;
let z = --y;
y--;
inspect = function() { return '' + x + y + z; }
