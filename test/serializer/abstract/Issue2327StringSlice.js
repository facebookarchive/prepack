let o = global.__abstractOrNull ? __abstractOrNull("string", "undefined") : undefined;
let s = "ok";

if (o != undefined) s = "X" + o.slice(3);
if (o != undefined) s = "Y" + o.slice(3);

global.s = s;

inspect = () => s;
