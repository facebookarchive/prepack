const React = require("react");

function Text(props, forwardedRef) {
  return <div forwardedRef={forwardedRef}>{props.children}</div>;
}

const TextForwardRef = React.forwardRef(Text);

// This condition has relevance as it cannot be `function` for the invariant in React Native’s
// `Animated.createAnimatedComponent`.
//
// https://github.com/facebook/react-native/blob/22cf5dc5660f19b16de3592ccae4c42cc16ace69/Libraries/Animated/src/createAnimatedComponent.js#L20-L25

const type = typeof TextForwardRef;

module.exports = {
  independent: true,
  getTrials: () => [["typeof `React.forwardRef`", type]],
};
