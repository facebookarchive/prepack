// limit stack depth: 10
// does not exceed stack depth limit

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
  return true;
};
