const React = require("react");

function MyComponent() {
  throw new Error("abrupt");
}

if (global.__optimizeReactComponentTree) global.__optimizeReactComponentTree(MyComponent);

MyComponent.getTrials = renderer => {
  let error = false;
  try {
    MyComponent({});
  } catch (error) {
    error = true;
  }
  return [["component errors", error]];
};

module.exports = MyComponent;
