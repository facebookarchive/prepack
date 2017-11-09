let x = global.__abstract ? __abstract("string", "('xxxx')") : "xxxx";
let y = global.__abstract ? __abstract("number", "(3)") : 3;
let ob =  { toString: () => x };
let ob2 = { toString: () => x, valueOf: () => y}
str = "aaa" + ob;
num = 123 + ob2;


inspect = function() { return str + num; }
