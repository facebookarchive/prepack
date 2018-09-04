// Copies of "foobar" in:1
// expected RecoverableError: PP0004

let o = global.__abstract ? __abstract("object", "('foobar42')") : "foobar42";
let s = true;

if (o != undefined) s = "foobar" in o;
if (o != undefined) s = "foobar" in o;

global.s = s;

inspect = () => s; // Should be true
