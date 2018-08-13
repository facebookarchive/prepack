// skip lint because __optimize isn't defined
function fn2(props) {
  var _ref11;
  var commentsConnection =
    (_ref11 = props) != null ? ((_ref11 = _ref11.feedback) != null ? _ref11.display_comments : _ref11) : _ref11;

  var nested = function() {
    return commentsConnection;
  };
  global.__optimize && __optimize(nested);
  return props.items.map(nested);
}

function fn(props) {
  return fn2({
    items: props.items,
    feedback: props.feedback,
  });
}

inspect = function() {
  return JSON.stringify(fn({ items: [0, 1, 2], feedback: { display_comments: [1, 2, 3] } }));
};

global.__optimize && __optimize(fn);
