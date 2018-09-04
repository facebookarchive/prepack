let o = global.__abstractOrNull ? __abstractOrNull("string", "undefined") : undefined;
let s = "ok";

if (o != undefined) s = o.split();
if (o != undefined) s = o.split();

global.s = s;

inspect = () => s;
