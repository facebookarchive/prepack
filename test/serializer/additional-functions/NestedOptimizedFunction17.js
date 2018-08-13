// arrayNestedOptimizedFunctionsEnabled

function fn(props, cond, cond2, cond3) {
  var arr = Array.from(props.x);
  var newObj;
  var value;

  if (cond) {
    var _ref8;
    value =
      (_ref8 = props.feedback) != null
        ? (_ref8 = _ref8.display_comments) != null
          ? _ref8.ordering_mode
          : _ref8
        : _ref8;

    var res = arr.map(function(item) {
      var fn2 = function() {
        return value;
      };

      return [item[value], fn2];
    });
  }

  return res;
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  return true;
};
