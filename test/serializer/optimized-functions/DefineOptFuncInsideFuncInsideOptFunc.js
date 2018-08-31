// arrayNestedOptimizedFunctionsEnabled
// skip lint
// The original issue here was that nested is defined inside of fn2 which is a non-optimized function
// called by fn (an optimized function). That caused Prepack to not detect that nested was nested
// in optimize.

function fn2(props) {
  var _ref11;
  var commentsConnection =
    (_ref11 = props) != null ? ((_ref11 = _ref11.feedback) != null ? _ref11.display_comments : _ref11) : _ref11;

  var func = props.func;

  var nested = function() {
    return func(commentsConnection);
  };
  if (global.__optimize) __optimize(nested);
  return props.items.map(nested);
}

function fn(props) {
  var items = Array.from(props.items);

  var func = function(commentsConnection) {
    return commentsConnection;
  };

  return fn2({
    items: items,
    func: func,
    feedback: props.feedback,
  });
}

inspect = function() {
  return JSON.stringify(fn({ items: [0, 1, 2], feedback: { display_comments: [1, 2, 3] } }));
};

if (global.__optimize) __optimize(fn);
