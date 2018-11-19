// es6
let IteratorPrototype = [][Symbol.iterator]().__proto__.__proto__;

inspect = function() {
  return IteratorPrototype;
};
