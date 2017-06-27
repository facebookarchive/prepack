let x = global.__abstract ? __abstract("boolean", "true") : true;
let p = x ? "x" : "y";
let q = x ? "y" : "z";
let r = x ? "f" : "g";

ob = { [p]: 1, [q]: 2 };
ob2 = { [r]: function(){ } };

inspect = function() { return ob.x + " " + ob.y + " " + ob2.f.name; }
