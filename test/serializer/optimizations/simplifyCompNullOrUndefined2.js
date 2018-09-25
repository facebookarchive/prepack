// does contain result = false

let x = global.__abstract ? __abstract(undefined, "undefined") : undefined;

if (x != null) global.result = x === undefined;

inspect = () => global.result;
