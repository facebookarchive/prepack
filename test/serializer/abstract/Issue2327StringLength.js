let o = global.__abstractOrNull ? __abstractOrNull("string", "undefined") : undefined;
let s;

if (o != undefined) s = 5 + o.length;
if (o != undefined) s = 7 + o.length;

global.s = s;

inspect = () => s;
