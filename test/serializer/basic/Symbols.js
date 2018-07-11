// es6
var it = Symbol.iterator;

inspect = function() {
  return it === Symbol.iterator;
};
