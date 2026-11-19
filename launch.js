/* Opens Home first when the app is launched fresh (Home Screen icon or the main link).
   Every page load inside the app leaves a mark in sessionStorage. The main page (Clients) only jumps to Home
   when there is no mark yet and no #tab or ?query was asked for, so the Clients switches always go where they are told.
   If the browser blocks sessionStorage, nothing happens and Clients opens as before. */
(function () {
  try {
    var KEY = "cd.inapp";
    var marked = sessionStorage.getItem(KEY) === "1";
    sessionStorage.setItem(KEY, "1");
    var main = /\/(index\.html)?$/.test(location.pathname);
    if (!marked && main && !location.hash && !location.search) location.replace("home.html");
  } catch (e) {}
})();
