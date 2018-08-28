// Copies of length:1

let o = global.__abstract ? __abstract("string", "('xyz')") : "xyz";
let s;

if (o != undefined) s = 5 + o.length;
if (o != undefined) s = 7 + o.length;

global.s = s;

inspect = () => s;
