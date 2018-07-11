// add at runtime: global.o = { foo: undefined };
if (global.__abstract)
  o = __abstract(
    {
      foo: __abstractOrNullOrUndefined("number"),
    },
    "global.o"
  );
let check = o && typeof o.foo === "number" && o.foo >= 3;

inspect = function() {
  return check + " " + global.o.foo;
};
