function fn(x) {
  for (
    var _iterator = x.entries(),
      _isArray = Array.isArray(_iterator),
      _i = 0,
      _iterator = _isArray ? _iterator : _iterator[Symbol.iterator]();
    ;

  ) {
    // ...

    var _ref;

    if (_isArray) {
      if (_i >= _iterator.length) break;
      _ref = _iterator[_i++];
    } else {
      _i = _iterator.next();
      if (_i.done) break;
      _ref = _i.value;
    }

    var item = _ref;
  }
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify(fn([1, 2, 3, 4, 5]));
};
