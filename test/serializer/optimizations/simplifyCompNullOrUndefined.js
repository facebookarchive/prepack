let x = global.__abstract ? __abstract(undefined, "undefined") : undefined;

if (x == null) global.result = x === null;

inspect = () => global.result;
