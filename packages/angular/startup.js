if(Meteor.isClient) {
	angular.element(document).ready(function() {
		angular.bootstrap(document, ["app"]);
	});
} else {
	
	angular.start = function(modules) {
		function load() {
			var injector = createInjector(modules);
			injector.invoke(['$injector', function(injector){ }]);
		}
		
		Meteor.startup ? Meteor.startup(load) : load();
	}	
}