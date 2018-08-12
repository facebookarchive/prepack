// Copies of "foobar" instanceof:1
// expected RecoverableError: PP0004

let o = global.__abstract ? __abstract("object", "({})") : {};
let s = true;

if (o != undefined) s = "foobar" instanceof o;
if (o != undefined) s = "foobar" instanceof o;

global.s = s;

inspect = () => s; // Should be true
