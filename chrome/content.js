// This content_script is for changing the title after page loaded.
var app = {};
// All logs should start with this.
app.name = "[arXiv-utils]";
// These 4 below are For checking if tab title has been updated.
app.id = undefined;
app.type = undefined;
app.title = undefined;
app.newTitle = undefined;
// Return the type parsed from the url. (Returns "PDF" or "Abstract")
app.getType = function (url) {
  if (url.endsWith(".pdf")) {
    return "PDF";
  }
  return "Abstract";
}
// Return the id parsed from the url.
app.getId = function (url, type) {
  var match;
  if (type === "PDF") {
    // match = url.match(/arxiv.org\/pdf\/([\S]*)\.pdf$/);
    // Must use below for other PDF serving URL.
    match = url.match(/arxiv.org\/[\S]*\/([^\/]*)\.pdf$/);
    // The first match is the matched string, the second one is the captured group.
    if (match === null || match.length !== 2) {
      return null;
    }
  } else {
    match = url.match(/arxiv.org\/abs\/([\S]*)$/);
    // The first match is the matched string, the second one is the captured group.
    if (match === null || match.length !== 2) {
      return null;
    }
  }
  return match[1];
}
// Get the title asynchronously, call the callbacks with the id, the type, and the queried title as argument when request done (`callback(id, type, title, newTitle)`).
// Updates `app`'s 4 variables: `title`, `type`, `id`, `newTitle` before callback.
app.getTitleAsync = function (id, type, callback, callback2) {
  var request = new XMLHttpRequest();
  request.open("GET", "https://export.arxiv.org/api/query?id_list=" + id);
  request.onload = function () {
    if (request.status === 200) {
      var resp = request.responseText;
      var parser = new DOMParser();
      var xmlDoc = parser.parseFromString(resp, "text/xml");
      // The first title is query string, second one is paper name.
      var title = xmlDoc.getElementsByTagName("title")[1].innerHTML;
      // Modify the title to differentiate from abstract pages.
      app.id = id;
      app.type = type;
      app.title = title;
      app.newTitle = title + " | " + type;
      callback(app.id, app.type, app.title, app.newTitle);
      callback2(app.id, app.type, app.title, app.newTitle);
    }
  };
  request.send();
}
// Insert the title into the active tab.
// After the insertion, the title might be overwritten after the PDF has been loaded.
app.insertTitle = function (id, type, title, newTitle) {
  console.log(app.name, "Trying to change title to: " + newTitle)
  var elTitles = document.getElementsByTagName("title");
  if (elTitles.length !== 0) {
    // Modify directly if <title> exists.
    var elTitle = elTitles[0];
    elTitle.innerText = newTitle;
    console.log(app.name, "Modify <title> tag directly.");
    return;
  }
  var elHeads = document.getElementsByTagName("head");
  if (elHeads.length !== 0) {
    // Modify <head> if <title> doesn't exist.
    var elHead = elHeads[0];
    var elTitle = document.createElement("title");
    elTitle.innerText = newTitle;
    elHead.appendChild(elTitle);
    console.log(app.name, "Modify <head> tag.");
    return;
  }
  var elHtmls = document.getElementsByTagName("html");
  if (elHtmls.length !== 0) {
    // Modify <html> if both <title> and <head> doesn't exist.
    var elHtml = elHtmls[0];
    var elHead = document.createElement("head");
    var elTitle = document.createElement("title");
    elTitle.innerText = newTitle;
    elHead.appendChild(elTitle);
    if (elHtml.firstChild !== null) {
      elHtml.insertBefore(elHead, elHtml.firstChild);
      console.log(app.name, "Modify <html> tag by inserting before first child.");
    } else {
      elHtml.appendChild(elHead);
      console.log(app.name, "Modify <html> tag by appending.");
    }
    return;
  }
  console.log(app.name, "Error: Cannot insert title");
}
// Add a direct download link if is abstract page.
app.addDownloadLink = function (id, type, title, newTitle) {
  if (type === "PDF") {
    return;
  }
  var fileName = title + ".pdf";
  var elULs = document.querySelectorAll(".full-text > ul");
  if (elULs.length === 0) {
    console.log(app.name, "Error: Items selected by '.full-text > ul' not found");
    return;
  }
  var elUL = elULs[0];
  var elLI = document.createElement("li");
  var elA = document.createElement("a");
  var directURL = "https://arxiv.org/pdf/" + id + ".pdf";
  elA.innerText = "Direct Download";
  elA.setAttribute("href", directURL);
  elA.setAttribute("download", fileName);
  elLI.appendChild(elA);
  elUL.appendChild(elLI)
  console.log(app.name, "Added direct download link.")
}
// Run this after the page has finish loading.
app.run = function () {
  var url = location.href;
  var type = app.getType(url);
  var id = app.getId(url, type);
  if (id === null) {
    console.log(app.name, "Error: Not in ArXiv pdf or abstract page, aborted.");
    return;
  }
  app.getTitleAsync(id, type, app.insertTitle, app.addDownloadLink);
}
app.run();

// Change the title again if it has been overwritten (PDF page only).
app.onMessage = function (tab, sender, sendResponse) {
  console.log(app.name, "onMessage / tab changed: " + tab.title + ".");
  if (tab.title === undefined || app.newTitle === undefined) {
    // Didn't changed title or are trying to change.
    return;
  }
  if (tab.title === app.newTitle || tab.title === tab.url) {
    // Changed by content_script itself.
    // For PDF page in Chrome, changing the tab title will result in
    // a intermediate title that is the tab's url.
    return;
  }
  if (app.type === "PDF" && tab.title === app.id + ".pdf") {
    // The title has been overwritten with the default name of arXiv.
    console.log(app.name, "Tab title has been changed!");
    app.insertTitle(app.id, app.type, app.title, app.newTitle);
    return;
  }
  console.log(app.name, "Warning: Some weird tab renaming happened.")
}
// Listen for background script's message, since the title might be changed when PDF is loaded.
chrome.runtime.onMessage.addListener(app.onMessage);
