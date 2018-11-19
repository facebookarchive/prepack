let x = global.__makePartial ? __makePartial({ p: 1 }, "({p: 1})") : { p: 1 };
Object.defineProperty(x, "p", { enumerable: false, value: 2 });
var z = Object.getOwnPropertyDescriptor(x, "p");
inspect = function() {
  return JSON.stringify(z);
};
