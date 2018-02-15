var copyOfObj = Object.assign({}, obj);
var copyOfCopyOfObj = Object.assign({}, copyOfObj);

inspect = function() {  
  return JSON.stringify(copyOfCopyOfObj);
}
