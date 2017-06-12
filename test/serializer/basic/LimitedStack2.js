// limit stack depth: 3
// exceeds stack depth limit

(function a() {
  return b();
})();

function b() {
  return c();
}

function c() {
  return 0;
}

inspect = function() {
  return false;
};
