// add at runtime:global.foo=global.bar={foo:0,bar:0,baz:0};global.baz={foo:0,bar:0,baz:0};
let template = { foo: 0, bar: 0, baz: 0 };
if (global.__abstract) {
  __widenIdentity(template);
}
let obj1 = global.__abstract ? __abstract(template, "global.foo", { externalTemplate: true }) : foo;
let obj2 = global.__abstract ? __abstract(template, "global.bar", { externalTemplate: true }) : bar;
let obj3 = global.__abstract ? __abstract(template, "global.baz", { externalTemplate: true }) : baz;

obj1.foo = 1;
obj2.bar = 2;
obj3.baz = 3;

inspect = function() {
  return obj1.foo + " " + obj1.bar + " " + obj1.baz;
};
