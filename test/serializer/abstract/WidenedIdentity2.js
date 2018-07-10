let template = {};
if (global.__abstract) {
  __widenIdentity(template);
}
let obj1 = global.__abstract ? __abstract(template, "({o:1})", { externalTemplate: true }) : {};
let obj2 = global.__abstract ? __abstract(template, "({o:2})", { externalTemplate: true }) : {};

let areEqual = obj1 === obj2;

inspect = function() {
  return areEqual;
};
