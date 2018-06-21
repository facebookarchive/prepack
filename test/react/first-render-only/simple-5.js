var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
  return <span {...props}>Hello {props.x}</span>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App() {
  function fn() {
    
  }
  return (
    <div>
      <A x={42} onClick={fn} />
      <B />
      <C />
    </div>
  );
}

App.getTrials = function(renderer, Root, data, isCompiled) {
  let results = [];
  renderer.update(<Root />);
  results.push(['simple render', renderer.toJSON()]);
  
  if (isCompiled === true) {
    let onClickExists = renderer.toTree().rendered.rendered[0].props.onClick !== undefined;
    
    if (onClickExists) {
      throw new Error("onClick was found on the <span> node");
    }
  }
  return results;
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App, {
    firstRenderOnly: true,
  });
}

module.exports = App;