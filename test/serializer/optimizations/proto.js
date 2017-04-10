let proto = {a:123};
let o = {};
Object.setPrototypeOf(o, proto);
global.x = o;
inspect = function() {
  return x.__proto__.a;
}