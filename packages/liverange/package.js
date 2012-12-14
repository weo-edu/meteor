Package.describe({
  summary: "Mark, track, and update an arbitrary region in the DOM"
});

Package.on_use(function (api) {
  api.add_files('liverange.js', 'client');
});

Package.on_test(function (api) {
  api.use(['tinytest']);
  api.use(['liverange', 'test-helpers', 'domutils'], 'client');

  api.add_files([
    'liverange_test_helpers.js',
    'liverange_tests.js'
  ], 'client');
});
