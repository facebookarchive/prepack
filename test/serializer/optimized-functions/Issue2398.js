// arrayNestedOptimizedFunctionsEnabled

function fn(props, cond) {
  var arr = Array.from(props.x);
  var newObj;

  if (cond) {
    var _ref8;
    var value =
      (_ref8 = props.feedback) != null
        ? (_ref8 = _ref8.display_comments) != null
          ? _ref8.ordering_mode
          : _ref8
        : _ref8;

    var fn2 = function() {
      return value;
    };

    var res = arr.map(function(item) {
      return item[value];
    });
  }

  return [res, fn2];
}

global.__optimize && __optimize(fn);

global.inspect = function() {
  let [res, fn2] = fn(
    {
      x: [1, 2],
      feedback: {
        display_comments: {
          ordering_mode: "foo",
        },
      },
    },
    true
  );
  res.push(fn2());
  return JSON.stringify(res);
};
