function MaybeThrow(props) {
  if (props.b === false) {
    return "Good";
  }
  throw new Error("no");
}

function App(props) {
  if (props.a === true) {
    var newProps = {};

    Object.assign(newProps, props, {
      children: "div",
    });
    return MaybeThrow(newProps);
  }
  return "Bad";
}

inspect = function() {
  return App({ a: true, b: false });
};

if (this.__optimize) __optimize(App);
