// additional functions
// recover-from-errors
// expected errors: [{"location":null,"severity":"FatalError","errorCode":"PP1001","message":"Additional function additional2 not defined in the global object"}]

function additional1() {}

inspect = function() {
  return "foo";
}
