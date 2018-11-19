// es6
let MapIteratorPrototype = new Map()[Symbol.iterator]().__proto__;

inspect = function() {
  return MapIteratorPrototype;
};
