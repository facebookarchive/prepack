var foo = { x: 42 };
let obj = global.__makePartial ? global.__makePartial({ x: __abstract("number", "foo.x") }) : foo;
let y = obj.x++;
inspect = function() {
  return "" + obj.x + y;
};
