// expected Warning: PP0023
function nullthrows(x) {
  if (x != null) {
    return x;
  }
  throw new Error("no");
}

function App(props) {
  nullthrows(props.className);
  return {
    className: props.className,
  };
}

if (global.__optimize) __optimize(App);

inspect = function() {
  return 42;
}; // just make sure no invariants in Prepack blow up
