Package.describe({
  summary: "Angular collection service.",
});

Package.on_use(function(api) {
	api.use('angular', 'client');
	api.add_files('collection.js', 'client');
});