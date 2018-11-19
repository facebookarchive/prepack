// es6
// react
// babel:jsx

function createElement(type, options, ...children) {
  let key = null;
  let ref = null;

  if (options != null) {
    if (options.key !== undefined) {
      key = options.key;
      delete options.key;
    }
    if (options.ref !== undefined) {
      ref = options.ref;
      delete options.ref;
    }
  }
  let props = Object.assign({}, options);
  if (children !== undefined) {
    if (children.length === 1) {
      props.children = children[0];
    } else {
      props.children = children;
    }
  }
  return {
    $$typeof: Symbol.for("react.element"),
    props,
    key,
    ref,
    type,
    _owner: undefined,
  };
}

global.React = {
  createElement,
};

global.toggle = true;

global.reactElement = (
  <div>
    <span>Span 1</span>
    Text node
    {[
      <span>Span 2</span>,
      "Text node",
      [
        <em key="a">Em 1</em>,
        <em key="b">Em 2</em>,
        "Text node",
        <em key="c">Em 3</em>,
        toggle ? <em key="d">Em 4</em> : <em key="d">Em 5</em>,
      ],
      <span>Span 3</span>,
    ]}
    <span>Span 4</span>
  </div>
);

inspect = function() {
  return global.reactElement;
};
