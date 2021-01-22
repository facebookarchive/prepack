// add at runtime:var obj = {foo: 0, bar: 2};
var template = { foo: 0, bar: 2 };

var o = global.__abstract
  ? __abstract(template, "obj", {
      externalTemplate: true,
    })
  : obj;

o.foo = 1;
delete o.bar;

inspect = function() {
  return obj.foo + " " + obj.bar;
};
