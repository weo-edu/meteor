Package.describe({
  summary: "HTML enhanced for web apps!",
});

Package.on_use(function (api) {
  api.add_files(['angular.js'],'client');
});
