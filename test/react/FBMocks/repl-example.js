var React = require("React");

function Yar(props) {
  return (
    <a href={props.href}>
      <em>{props.name}</em>
    </a>
  );
}

function Bar(props) {
  return (
    <div>
      <span style={{ color: "red" }}>Here's a link</span>: <Yar {...props} />
    </div>
  );
}

// for now, we require inline Flow type annotations on the root component
// for its props (if it has any)
function Foo(props: { href: string }) {
  var collection = [
    { href: props.href, name: "First Item" },
    { href: props.href, name: "Second Item" },
    { href: props.href, name: "Third Item" },
  ];

  return <div>{collection.map(item => <Bar {...item} />)}</div>;
}

// this is a special Prepack function hook
// that tells Prepack the root of a React component tree
if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(Foo);
}

window.Foo = Foo;
