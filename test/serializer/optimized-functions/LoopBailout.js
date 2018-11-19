function fn(props, splitPoint) {
  var text = props.text || "";

  text = text.replace(/\s*$/, "");

  if (splitPoint !== null) {
    while (text[splitPoint - 1] === "\n") {
      splitPoint--;
    }
  }
  return splitPoint;
}

global.__optimize && __optimize(fn);

inspect = function() {
  return fn({ text: "foo\nfoo" }, 5);
};
