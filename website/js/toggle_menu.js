var toggle = document.getElementById("nav-toggle");
var menu = document.getElementById("nav-menu");

toggle.addEventListener("click", function() {
  if (this.className === "nav-toggle") {
    this.className = "nav-toggle is-active";
    menu.classList.add("is-active");
  } else {
    this.className = "nav-toggle";
    menu.classList.remove("is-active");
  }
});
