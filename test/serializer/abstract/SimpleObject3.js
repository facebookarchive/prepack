// add at runtime: var foo = { props: { toolbox: {}, trackingCodes: null, feedProps: [],  unit: { firstItem: { edges: [{ node: 123 }] } } } };
function render(_ref3) {
  var _ref;
  var props = _ref3.props;
  if (props == null) return null;
  var item =
    (_ref = props.unit) != null
      ? (_ref = _ref.firstItem) != null
        ? (_ref = _ref.edges) != null
          ? (_ref = _ref[0]) != null
            ? _ref.node
            : _ref
          : _ref
        : _ref
      : _ref;
  if (!item) {
    return null;
  } else {
    return {
      unit: props.unit,
      item: item,
      toolbox: props.toolbox,
      trackingCodes: props.trackingCodes,
      feedProps: props.feedProps,
    };
  }
}
let wellBehavedObject = {
  props: { toolbox: {}, trackingCodes: null, feedProps: [], unit: { firstItem: { edges: [{ node: 123 }] } } },
};
let wellBehavedParameter = global.__abstract ? __abstract("object", "foo") : wellBehavedObject;
if (global.__makeSimple) __makeSimple(wellBehavedParameter, "transitive");
var prepackedRender = render(wellBehavedParameter);

inspect = function() {
  return JSON.stringify(prepackedRender);
};
