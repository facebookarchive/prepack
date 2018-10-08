// add at runtime:global.foo=global.bar={};
let template = {};
if (global.__abstract) {
  __widenIdentity(template);
}
let obj1 = global.__abstract ? __abstract(template, "global.foo", { externalTemplate: true }) : foo;
let obj2 = global.__abstract ? __abstract(template, "global.bar", { externalTemplate: true }) : bar;

let areEqual = obj1 === obj2;

inspect = function() {
  return areEqual;
};
