// expected RecoverableError: PP0004

let o = global.__abstractOrNull ? __abstractOrNull("object", "undefined") : undefined;
let s = true;

if (o != undefined) s = "foobar" in o;
if (o != undefined) s = "foobar" in o;

global.s = s;

inspect = () => s; // Should be true
