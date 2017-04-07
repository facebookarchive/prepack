let x = global.__abstract ? __abstract({p: 1}, "({p: 1})") : {p: 1};
Object.defineProperty(x, "p", {enumerable: false, value: 2});
z = Object.getOwnPropertyDescriptor(x, "p");
inspect = function() { return JSON.stringify(z); }
