var React = require("React");

function App(props) {
  return (
    <div>
      <h1>{props.header.toString()}</h1>
      <ul>{props.items && props.items.map(item => <li key={item.id}>{item.title.toString()}</li>)}</ul>
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  var items = [{ id: 0, title: "Item 1" }, { id: 1, title: "Item 2" }, { id: 2, title: "Item 3" }];
  renderer.update(<Root items={items} header={"Hello world!"} />);
  return [["render simple with props model", renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  let universe = {
    Item: {
      kind: "object",
      jsType: "object",
      properties: {
        id: {
          shape: {
            kind: "scalar",
            jsType: "integral",
          },
          optional: false,
        },
        title: {
          shape: {
            kind: "scalar",
            jsType: "string",
          },
          optional: false,
        },
      },
    },
    Props: {
      kind: "object",
      jsType: "object",
      properties: {
        header: {
          shape: {
            kind: "scalar",
            jsType: "string",
          },
          optional: false,
        },
        items: {
          shape: {
            kind: "array",
            jsType: "array",
            elementShape: {
              shape: {
                kind: "link",
                shapeName: "Item",
              },
              optional: false,
            },
          },
          optional: true,
        },
      },
    },
  };

  let appModel = {
    component: {
      props: "Props",
    },
    universe,
  };

  __optimizeReactComponentTree(App, {
    model: JSON.stringify(appModel),
  });
}

module.exports = App;
