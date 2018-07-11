// es6
// react
// babel:jsx

function MyComponent(props) {
  return <span>{props.title}</span>;
}
MyComponent.defaultProps = {
  title: "Hello world",
  children: "No children!",
};

function ChildComponent(props) {
  return <span>{props.title}</span>;
}
ChildComponent.defaultProps = {
  title: "I am a child",
};

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

global.reactElement = (
  <MyComponent>
    <ChildComponent title={"I am a child (overwritten)"} />
  </MyComponent>
);

inspect = function() {
  return global.reactElement;
};
