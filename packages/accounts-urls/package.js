Package.describe({
  summary: "Generate and consume reset password and validate account URLs",
  internal: true
});

Package.on_use(function (api) {
  api.use('absolute-url', 'server');
  api.add_files('url_client.js', 'client');
  api.add_files('url_server.js', 'server');
});
